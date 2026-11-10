-- Keep the existing launch catalog in Houston. New listings can select a market.
ALTER TABLE deals ADD COLUMN market_id text NOT NULL DEFAULT 'houston';
CREATE INDEX deals_published_market_idx ON deals(market_id) WHERE published;

-- Market waitlists are independent opt-ins. The existing city alerts and their
-- unsubscribe tokens remain valid while the app transitions to market alerts.
CREATE TABLE market_deal_alerts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id text NOT NULL,
  unsubscribe_token uuid NOT NULL UNIQUE,
  active boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, market_id)
);

CREATE INDEX market_deal_alerts_active_market_idx
  ON market_deal_alerts(market_id) WHERE active;
