
CREATE TABLE IF NOT EXISTS userprofile (
    id SERIAL PRIMARY KEY,
    username VARCHAR(15) NOT NULL,
    firstname VARCHAR(45) NOT NULL,
    lastname VARCHAR(45) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password TEXT NOT NULL,
    balance numeric(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_suspended BOOLEAN DEFAULT false,
    is_locked boolean DEFAULT false,
    temp_2fa_secret VARCHAR(255),
    two_factor_secret VARCHAR(255) ,
    two_factor_enabled BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    verification_code VARCHAR(6),
    verification_code_expires_at timestamp without time zone,
    last_verification_code_sent_at timestamp without time zone,
    profile_picture VARCHAR(255),
    referral_code VARCHAR(50) UNIQUE,
    business_balance numeric(15,2) DEFAULT 0.00,
    notify_unusual_activity BOOLEAN DEFAULT FALSE,
    last_login_ip VARCHAR(255),
    deletion_requested BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases_admin_product (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    buyer_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    admin_id INT REFERENCES admins(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    date_purchased TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    purchase_id VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_history (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    charge NUMERIC(10,2) NOT NULL,
    order_id VARCHAR(20),
    status VARCHAR(20) NOT NULL,
    start_count VARCHAR(100),
    remain TEXT,
    quantity INTEGER NOT NULL,
    link TEXT NOT NULL,
    service TEXT,
    order_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    refund_amount NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    activity text,
    time TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_products (
	id SERIAL PRIMARY KEY,
	admin_id INT REFERENCES admins(id) ON DELETE CASCADE,
	years INT NOT NULL,
	profile_link TEXT NOT NULL,
	account_type TEXT NOT NULL,
	country TEXT NOT NULL,
	description TEXT NOT NULL,
	amount numeric(10,2) NOT NULL,
    payment_status TEXT DEFAULT 'not sold',
    logindetails TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW(),
    sold_at TIMESTAMPTZ,
    statustype text
);

CREATE TABLE IF NOT EXISTS sms_order (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    phone_number VARCHAR(20),
    order_id VARCHAR(50),
    country VARCHAR(30),
    service TEXT,
    cost NUMERIC(10,2),
    amount NUMERIC(10,2),
    status TEXT DEFAULT 'pending',
    code VARCHAR(10),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES userprofile(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    reference VARCHAR(100) NOT NULL,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    referred_user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    deposit_number INT,
    commission_amount DECIMAL(10, 2)
);

CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2),
    deposit_number INT
);

CREATE TABLE IF NOT EXISTS miscellaneous (
	id SERIAL PRIMARY KEY,
	rate numeric(10,2) DEFAULT 1500,
	smtp_email VARCHAR(255) NOT NULL,
    smtp_pass VARCHAR(255) NOT NULL,
    sms_price numeric(10,2) DEFAULT 2500,
    withdrawal_enabled BOOLEAN NOT NULL DEFAULT TRUE
    p2pmarket_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
    id SERIAL PRIMARY KEY,
    admin_id INT REFERENCES admins(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2),
    withdrawal_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referred_by INT REFERENCES userprofile(id) ON DELETE CASCADE,
    referred_user INT REFERENCES userprofile(id) ON DELETE CASCADE,
    commission_earned BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS challenge (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
  week_start DATE,
  week_end DATE,
  progress DECIMAL DEFAULT 0,
  total_transaction DECIMAL DEFAULT 0,
  challenge_complete BOOLEAN DEFAULT false
);

ALTER TABLE challenge ADD CONSTRAINT challenge_user_week_unique UNIQUE (user_id, week_start);

CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");


CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    type VARCHAR(50),
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    read BOOLEAN DEFAULT false
);

CREATE TABLE payment_gateways (
  id SERIAL PRIMARY KEY,
  gateway_name VARCHAR(50) UNIQUE NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO payment_gateways (gateway_name, is_enabled) 
VALUES ('bankaccount', true);


CREATE TABLE deletion_date (
	id SERIAL PRIMARY KEY,
	user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
	request_time TIMESTAMPTZ DEFAULT NOW()
);


DROP TABLE IF EXISTS pending_deposits;
CREATE TABLE pending_deposits (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
	reference VARCHAR(100) NOT NULL,
    transaction_reference VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_by_admin BOOLEAN DEFAULT FALSE,
    ALTER TABLE pending_deposits ADD COLUMN proof_image BYTEA
);

CREATE TABLE ticket_statuses (
    id SERIAL PRIMARY KEY,
    status_name VARCHAR(50) NOT NULL
);

INSERT INTO ticket_statuses (status_name)
VALUES 
('Open'),
('Closed'),
('Pending'),
('Resolved');

CREATE TABLE ticket_priorities (
    id SERIAL PRIMARY KEY,
    priority_name VARCHAR(50) NOT NULL
);

INSERT INTO ticket_priorities (priority_name)
VALUES 
('Low'),
('Medium'),
('High'),
('Urgent');


CREATE TABLE support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(255) NOT NULL,
    user_id INTEGER REFERENCES userprofile(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
	service VARCHAR(255) NOT NULL,
    order_id VARCHAR(255),
    description TEXT NOT NULL,
    status_id INTEGER DEFAULT 1 REFERENCES ticket_statuses(id) ON DELETE CASCADE,
	status VARCHAR(25) NOT NULL,
    priority_id INTEGER DEFAULT 2 REFERENCES ticket_priorities(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP, 
    resolved_at TIMESTAMP 
);

CREATE TABLE ticket_responses (
    id SERIAL PRIMARY KEY,
    ticket_id VARCHAR(255) NOT NULL,
    support_tickets_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,       
    user_id INTEGER REFERENCES userprofile(id) ON DELETE CASCADE,
	admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
	sender VARCHAR(25) NOT NULL,
    message TEXT NOT NULL,
	seen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- remember to add




-- delete






