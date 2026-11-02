import Fastify from 'fastify'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbPool } from '../db/pool.js'
import { registerOfferInterestRoutes } from './interests.js'

// Execute the actual route SQL against an isolated PostgreSQL engine. These
// fixtures need no external database and never connect to a client's service.
const db = new PGlite()
const app = Fastify()
const guard = (request: { headers: Record<string, unknown> }) => {
  if (!request.headers['x-test-role']) throw Object.assign(new Error('Sign in required'), { statusCode: 401 })
  if (request.headers['x-test-role'] !== 'admin') throw Object.assign(new Error('Admin required'), { statusCode: 403 })
  return { id: 'admin' }
}
registerOfferInterestRoutes(app, { query: db.query.bind(db) } as unknown as DbPool, guard, guard)
const get = (url: string) => app.inject({ method: 'GET', url, headers: { 'x-test-role': 'admin' } })

beforeAll(async () => {
  await db.exec(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,first_name text,last_name text,personal_email text,work_email text,city text,
      is_demo boolean DEFAULT false,is_superadmin boolean DEFAULT false,educator_verified_at timestamptz,created_at timestamptz
    );
    CREATE TABLE businesses (id text PRIMARY KEY,name text,published boolean DEFAULT false);
    CREATE TABLE deals (
      id text PRIMARY KEY,business_id text REFERENCES businesses(id),title text,event_name text,cta_type text,
      published boolean DEFAULT false,starts_at timestamptz,ends_at timestamptz,created_at timestamptz
    );
    CREATE TABLE offer_interest_submissions (
      id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),deal_id text REFERENCES deals(id),business_id text REFERENCES businesses(id),
      cta_type text,member_id text,full_name text,email text,business_name text,event_name text,submitted_at timestamptz,
      UNIQUE(user_id,deal_id)
    );
    INSERT INTO businesses(id,name) VALUES ('a','Archived partner A'),('b','Archived partner B');
    INSERT INTO deals(id,business_id,title,event_name,cta_type,starts_at,ends_at,created_at) VALUES
      ('a','a','Changed offer A','Renamed event A','use_deal','2019-01-01','2019-02-01','2019-01-01'),
      ('b','b','Past event B','Past event B','rsvp','2019-01-01','2019-02-01','2019-01-01'),
      ('empty','b','Empty invitation','Empty invitation','get_launch_invite','2019-01-01','2019-02-01','2019-01-01');
    INSERT INTO users(id,first_name,last_name,personal_email,work_email,city,created_at,educator_verified_at)
      SELECT md5('only-'||i)::uuid,'Registered','Member '||i,'only'||i||'@example.test',
        CASE WHEN i=0 THEN 'SCHOOL0@example.test' WHEN i=1 THEN 'literal%address@example.test' END,
        'Houston, Texas','2020-01-01',CASE WHEN i=0 THEN '2020-01-02'::timestamptz END
      FROM generate_series(0,124) i;
    INSERT INTO users(id,first_name,last_name,personal_email,city,created_at)
      SELECT md5('response-'||i)::uuid,'Past','Responder '||i,'responder'||i||'@example.test','Houston, Texas','2019-01-01'
      FROM generate_series(0,101) i;
    INSERT INTO users(id,first_name,personal_email,is_demo,is_superadmin,created_at) VALUES
      (md5('demo')::uuid,'Demo','demo@example.test',true,false,'2026-01-01'),
      (md5('admin')::uuid,'Admin','admin@example.test',false,true,'2026-01-01');
    INSERT INTO offer_interest_submissions(id,user_id,deal_id,business_id,cta_type,member_id,full_name,email,business_name,event_name,submitted_at)
      SELECT md5('submission-'||i)::uuid,md5('response-'||i)::uuid,CASE WHEN i=101 THEN 'b' ELSE 'a' END,
        CASE WHEN i=101 THEN 'b' ELSE 'a' END,
        CASE WHEN i%3=0 THEN 'rsvp' WHEN i%3=1 THEN 'get_launch_invite' ELSE 'join_waitlist' END,
        'OLD-'||i,'Saved responder '||i,'saved'||i||'@example.test',
        CASE WHEN i=101 THEN 'Archived partner B' ELSE 'Archived partner A' END,
        CASE WHEN i=101 THEN 'Past event B' ELSE 'Original event A' END,'2019-01-15'
      FROM generate_series(0,101) i;
  `)
  await app.ready()
}, 60000)

afterAll(async () => { await app.close(); await db.close() })

describe('admin history using PostgreSQL data', () => {
  it('returns every retained response across pages despite expired offers and unverified members', async () => {
    const first = await get('/api/admin/offer-interests?scope=events')
    expect(first.statusCode).toBe(200)
    expect(first.json().totals).toEqual({ submissions: 102, educators: 102 })
    expect(first.json().submissions).toHaveLength(100)
    const second = await get('/api/admin/offer-interests?scope=events&page=2')
    expect(second.json().submissions).toHaveLength(2)
    const all = [...first.json().submissions, ...second.json().submissions]
    expect(new Set(all.map(row => row.id)).size).toBe(102)
    expect(new Set(all.map(row => row.cta_type))).toEqual(new Set(['rsvp','get_launch_invite','join_waitlist']))
    expect(all.find(row => row.deal_id === 'a')).toMatchObject({ event_name: 'Original event A' })
    expect(first.json().offers.find((offer: { id: string }) => offer.id === 'a').interested).toBe(101)
  })

  it('keeps the event, business and response filters identical in rows, totals and full exports', async () => {
    const list = await get('/api/admin/offer-interests?scope=events&dealId=a&businessId=a&ctaType=rsvp')
    expect(list.json().submissions).toHaveLength(34)
    expect(list.json().totals).toEqual({ submissions: 34, educators: 34 })
    const csv = await get('/api/admin/offer-interests?scope=events&dealId=a&businessId=a&ctaType=rsvp&export=csv')
    expect(csv.body.trim().split('\r\n')).toHaveLength(35)
    expect(csv.body).toContain('"RSVP confirmed"')
    expect(csv.body).not.toContain('Invitation requested')
    expect(csv.body).not.toContain('Past event B')
    const allTypes = await get('/api/admin/offer-interests?scope=events&dealId=a&export=csv')
    expect(allTypes.body.trim().split('\r\n')).toHaveLength(102)
    expect(allTypes.body).toContain('"Invitation requested"')
    expect(allTypes.body).toContain('"Waitlist joined"')
    const empty = await get('/api/admin/offer-interests?scope=events&dealId=empty')
    expect(empty.json()).toMatchObject({ submissions: [], totals: { submissions: 0, educators: 0 } })
  })

  it('lists old account-only registrations separately, including verified and unverified members', async () => {
    const first = await get('/api/admin/registrations-without-response')
    expect(first.statusCode).toBe(200)
    expect(first.headers['cache-control']).toBe('no-store')
    expect(first.json().totals).toEqual({ members: 125 })
    expect(first.json().registrations).toHaveLength(100)
    const second = await get('/api/admin/registrations-without-response?page=2')
    expect(second.json().registrations).toHaveLength(25)
    const all = [...first.json().registrations,...second.json().registrations]
    expect(new Set(all.map(row => row.id)).size).toBe(125)
    expect(all.filter(row => row.is_verified)).toHaveLength(1)
    expect(all.some(row => /demo@|admin@|responder\d+@/.test(row.email))).toBe(false)
    const csv = await get('/api/admin/registrations-without-response?export=csv')
    expect(csv.body.trim().split('\r\n')).toHaveLength(126)
    expect(csv.body).toContain('"Registered only"')
    expect(csv.body).not.toContain('"RSVP confirmed"')
  })

  it('searches account and school emails literally and case insensitively with matching totals and CSV', async () => {
    for (const search of ['school0', 'only0@', 'Registered Member 0']) {
      const encoded = encodeURIComponent(search)
      const response = await get(`/api/admin/registrations-without-response?search=${encoded}`)
      expect(response.json().totals).toEqual({ members: 1 })
      expect(response.json().registrations[0].email).toBe('SCHOOL0@example.test')
      const csv = await get(`/api/admin/registrations-without-response?search=${encoded}&export=csv`)
      expect(csv.body.trim().split('\r\n')).toHaveLength(2)
    }
    const literal = await get('/api/admin/registrations-without-response?search=%25')
    expect(literal.json().totals).toEqual({ members: 1 })
    const empty = await get('/api/admin/registrations-without-response?search=not-a-registered-member')
    expect(empty.json()).toMatchObject({ registrations: [], totals: { members: 0 } })
  })

  it('removes a registration from the account-only list only after an actual event response exists', async () => {
    await db.exec(`INSERT INTO offer_interest_submissions(id,user_id,deal_id,business_id,cta_type,member_id,full_name,email,business_name,event_name,submitted_at)
      VALUES(md5('new-response')::uuid,md5('only-124')::uuid,'b','b','get_launch_invite','NEW-124','Registered Member 124','only124@example.test','Archived partner B','Past event B',now())`)
    const registrations = await get('/api/admin/registrations-without-response?search=only124@')
    expect(registrations.json()).toMatchObject({ registrations: [], totals: { members: 0 } })
    const event = await get('/api/admin/offer-interests?scope=events&dealId=b')
    expect(event.json().submissions).toEqual(expect.arrayContaining([expect.objectContaining({ email: 'only124@example.test', cta_type: 'get_launch_invite' })]))
  })

  it.each([undefined,'member'])('protects both lists and exports from role %s', async role => {
    for (const route of ['/api/admin/registrations-without-response','/api/admin/registrations-without-response?export=csv','/api/admin/offer-interests?scope=events','/api/admin/offer-interests?scope=events&export=csv']) {
      const result = await app.inject({ method: 'GET', url: route, headers: role ? { 'x-test-role': role } : {} })
      expect(result.statusCode).toBe(role ? 403 : 401)
    }
  })
})
