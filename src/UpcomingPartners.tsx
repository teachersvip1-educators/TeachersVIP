const UPCOMING_PARTNERS = [
  {
    name: "Blue Wavy Car Wash",
    category: "Services",
    image: "/coming-soon/blue-wavy-car-wash.png",
    perk: "15% off for educators",
    description: "A fresh clean and a little extra savings. Participating locations and launch details will be announced.",
  },
  {
    name: "Juiceland Juice Bar",
    category: "Food & Drink",
    image: "/coming-soon/juiceland-juice-bar.png",
    perk: "25% off for educators",
    description: "Fresh local perks are on the way. Participating locations and launch details will be announced.",
  },
  {
    name: "Spa Delight",
    category: "Services",
    image: "/coming-soon/spa-delight.png",
    perk: "15% off for educators",
    description: "A little time to recharge. Participating locations and launch details will be announced.",
  },
  {
    name: "Sports, Events & Entertainment",
    category: "Sports & Events",
    image: "/coming-soon/sports-events-entertainment.png",
    perk: "Exclusive educator discounts planned",
    description: "Baseball, soccer, football, basketball and more. Participating teams, venues and offer details are coming soon.",
  },
] as const

export function upcomingPartnersFor(category: string, search: string) {
  return UPCOMING_PARTNERS.filter(partner =>
    (category === "All" || partner.category === category) &&
    `${partner.name} ${partner.category} ${partner.perk}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
}

export default function UpcomingPartners({ category, search }: { category: string; search: string }) {
  const partners = upcomingPartnersFor(category, search)
  if (!partners.length) return null
  return <section className="upcoming-partners" aria-labelledby="upcoming-heading">
    <div className="section-heading"><h2 id="upcoming-heading">Coming soon to TeachersVIP</h2><span>{partners.length}</span></div>
    <p className="upcoming-intro">A preview of what’s next. These offers are not available yet; locations and launch details will be announced.</p>
    <div className="upcoming-grid">
      {partners.map(partner => <article className="upcoming-card" key={partner.name}>
        <img src={partner.image} alt={`${partner.name} — coming soon. ${partner.perk}.`} loading="lazy" width="1536" height="1024" />
        <div className="upcoming-copy">
          <span className="upcoming-label">Coming soon · {partner.category}</span>
          <h3>{partner.name}</h3>
          <strong>{partner.perk}</strong>
          <small>Planned educator offer</small>
          <p>{partner.description}</p>
        </div>
      </article>)}
    </div>
  </section>
}
