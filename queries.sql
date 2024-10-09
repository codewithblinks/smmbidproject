-- userprofile 1

CREATE TABLE IF NOT EXISTS userprofile (
    id SERIAL PRIMARY KEY,
    username VARCHAR(15) NOT NULL,
    firstname VARCHAR(45) NOT NULL,
    lastname VARCHAR(45) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password text NOT NULL,
    balance numeric(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_suspended boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    temp_2fa_secret VARCHAR(255),
    two_factor_secret VARCHAR(255) ,
    two_factor_enabled boolean DEFAULT false,
    email_verified boolean DEFAULT false,
    verification_code VARCHAR(6),
    verification_code_expires_at timestamp without time zone,
    last_verification_code_sent_at timestamp without time zone,
    profile_picture VARCHAR(255),
    referral_code VARCHAR(50) UNIQUE
);

-- admin 2

CREATE TABLE IF NOT EXISTS admins(
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- product_list 10

CREATE TABLE IF NOT EXISTS product_list(
    id SERIAL PRIMARY KEY,
    account_username character NOT NULL,
    account_type TEXT NOT NULL,
    years integer NOT NULL,
    profile_link TEXT NOT NULL,
    account_country TEXT NOT NULL,
    amount numeric(10,2) NOT NULL,
    total_followers TEXT NOT NULL,
    description TEXT NOT NULL,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    payment_recieved numeric(10,2) NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'not sold',
    loginusername character varying(20),
    loginemail character varying(100),
    loginpassword TEXT,
    logindetails TEXT,
    verifycode TEXT,
    statustype character varying(50) DEFAULT 'manual',
    sold_at TIMESTAMPTZ,
)

-- purchase history 11

CREATE TABLE IF NOT EXISTS purchase_history
(
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

-- purchases 12

CREATE TABLE IF NOT EXISTS purchases
(
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    buyer_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    seller_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    owner TEXT
);

-- activity_log 1
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    activity text,
    time TIMESTAMPTZ DEFAULT NOW()
);

-- admin product list 2
-- remember to change the sold_at in the admin product.js

CREATE TABLE IF NOT EXISTS admin_products(
	id SERIAL PRIMARY KEY,
	admin_id INT REFERENCES admins(id) ON DELETE CASCADE,
	years INT NOT NULL,
	profile_link TEXT NOT NULL,
	account_type TEXT NOT NULL,
	country TEXT NOT NULL,
	description TEXT NOT NULL,
	amount numeric(10,2) NOT NULL,
	status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'not sold',
    loginusername VARCHAR(20),
    loginemail VARCHAR(100),
    loginpassword TEXT,
    logindetails TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW(),
    sold_at TIMESTAMPTZ,
    statustype text
)


-- smm order 17

CREATE TABLE IF NOT EXISTS sms_order
(
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
    "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Transactions Table 18

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES userprofile(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    reference VARCHAR(100) NOT NULL,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
)

-- withdrawal details table 19

CREATE TABLE IF NOT EXISTS withdrawal_details
(
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES userprofile(id) ON DELETE CASCADE,,
    bank_name VARCHAR(100),
    account_number VARCHAR(20),
    bank_code VARCHAR(10),
    recipient_code VARCHAR(100)
);


-- Commission Table 5

CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    referred_user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    deposit_number INT,
    commission_amount DECIMAL(10, 2)
);

-- deposits tracking table 6

CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2),
    deposit_number INT
);

-- Miscellaneous 7

CREATE TABLE IF NOT EXISTS miscellaneous (
	id SERIAL PRIMARY KEY,
	rate numeric(10,2) DEFAULT 1500,
	smtp_email VARCHAR(255) NOT NULL,
    smtp_pass VARCHAR(255) NOT NULL,
    sms_price numeric(10,2) DEFAULT 2500
)

-- password_reset_tokens 9

CREATE TABLE IF NOT EXISTS password_reset_tokens
(
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- ratings_reviews 13

CREATE TABLE IF NOT EXISTS ratings_reviews
(
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    rating INTEGER,
    review TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    writer_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    writer_username VARCHAR(15)
);

-- referral Withdrawals Table 14
CREATE TABLE IF NOT EXISTS referral_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2),
    withdrawal_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- referrals 15

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referred_by INT REFERENCES userprofile(id) ON DELETE CASCADE, -- ID of the user who referred
    referred_user INT REFERENCES userprofile(id) ON DELETE CASCADE, -- ID of the user who was referred
    commission_earned BOOLEAN DEFAULT FALSE -- To track if commission was given
);

-- challenge 4

CREATE TABLE IF NOT EXISTS challenge (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES userprofile(id),
  week_start DATE,
  week_end DATE,
  progress DECIMAL DEFAULT 0,
  total_transaction DECIMAL DEFAULT 0,
  challenge_complete BOOLEAN DEFAULT FALSE
);

-- sessions 16

CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- notification 8

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    type VARCHAR(50),
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    read BOOLEAN DEFAULT FALSE
);

-- you can retrieve the CREATE TABLE statement for an existing table in your PostgreSQL 
-- Replace your_username, your_database, and your_table with your PostgreSQL username, the database name, 
--and the table name, respectively. This command will output the CREATE TABLE statement for the specified table.

-- userprofile








