-- activity_log 1
CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    activity text,
    time TIMESTAMPTZ DEFAULT NOW()
);


-- admin product list 2
-- remember to change the sold_at in the admin product.js

CREATE TABLE admin_products(
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

-- admin 3

CREATE TABLE admins(
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- challenge 4

CREATE TABLE challenge (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES userprofile(id),
  week_start DATE,
  week_end DATE,
  progress DECIMAL DEFAULT 0,
  total_transaction DECIMAL DEFAULT 0,
  challenge_complete BOOLEAN DEFAULT FALSE
);

-- Commission Table 5

CREATE TABLE commissions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    referred_user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    deposit_number INT,
    commission_amount DECIMAL(10, 2)
);

-- deposits tracking table 6

CREATE TABLE deposits (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2),
    deposit_number INT
);

-- Miscellaneous 7

CREATE TABLE miscellaneous (
	id SERIAL PRIMARY KEY,
	rate numeric(10,2) DEFAULT 1500,
	smtp_email VARCHAR(255) NOT NULL,
    smtp_pass VARCHAR(255) NOT NULL,
    sms_price numeric(10,2) DEFAULT 2500
)

-- notification 8

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    type VARCHAR(50),
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    read BOOLEAN DEFAULT FALSE
);

-- password_reset_tokens 9








-- you can retrieve the CREATE TABLE statement for an existing table in your PostgreSQL 
-- Replace your_username, your_database, and your_table with your PostgreSQL username, the database name, 
--and the table name, respectively. This command will output the CREATE TABLE statement for the specified table.

-- userprofile

CREATE TABLE userprofile (
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

-- product_list

CREATE TABLE product_list(
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







-- referrals

CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referred_by INT REFERENCES userprofile(id) ON DELETE CASCADE, -- ID of the user who referred
    referred_user INT REFERENCES userprofile(id) ON DELETE CASCADE, -- ID of the user who was referred
    commission_earned BOOLEAN DEFAULT FALSE -- To track if commission was given
);




-- referral Withdrawals Table
CREATE TABLE referral_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES userprofile(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2),
    withdrawal_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES userprofile(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    reference VARCHAR(100) NOT NULL,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
)

-- sessions

CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
