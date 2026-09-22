CREATE TABLE properties (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('1BHK', '2BHK', '3BHK')),
    price NUMERIC(14, 2) NOT NULL CHECK (price > 0),
    location TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    bedrooms SMALLINT NOT NULL CHECK (bedrooms > 0),
    bathrooms SMALLINT NOT NULL CHECK (bathrooms > 0),
    area_sqft INTEGER NOT NULL CHECK (area_sqft > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leads (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_number VARCHAR(30),
    email VARCHAR(255),
    budget NUMERIC(14, 2) CHECK (budget IS NULL OR budget > 0),
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    lead_score NUMERIC(5, 2) CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100)),
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversations (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT,
    last_intent VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_properties_city ON properties (city);
CREATE INDEX idx_properties_status ON properties (status);
CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_conversations_lead_id ON conversations (lead_id);
