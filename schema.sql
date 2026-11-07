BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    nama VARCHAR(120) NOT NULL,
    no_hp VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(60) UNIQUE NOT NULL,
    nama VARCHAR(120) NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    nomor_polisi VARCHAR(20),
    merek_kendaraan VARCHAR(80),
    tipe_kendaraan VARCHAR(80),
    nomor_stnk VARCHAR(60),
    stnk_document_key TEXT,
    sim_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    sim_expiry_date DATE,
    catatan_admin TEXT,
    reviewed_by BIGINT REFERENCES admin_users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_types (
    id BIGSERIAL PRIMARY KEY,
    kode VARCHAR(40) UNIQUE NOT NULL,
    nama VARCHAR(100) NOT NULL,
    tarif_awal NUMERIC(12,2),
    tarif_per_km NUMERIC(12,2),
    tarif_minimum NUMERIC(12,2),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tarif_awal IS NULL OR tarif_awal >= 0),
    CHECK (tarif_per_km IS NULL OR tarif_per_km >= 0),
    CHECK (tarif_minimum IS NULL OR tarif_minimum >= 0)
);

CREATE TABLE IF NOT EXISTS app_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    commission_percent NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    year_two_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    commission_change_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (commission_percent BETWEEN 0 AND 100),
    CHECK (year_two_commission_percent BETWEEN 0 AND 100)
);

INSERT INTO app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service_types (kode, nama)
VALUES ('ojek', 'Ojek')
ON CONFLICT (kode) DO NOTHING;

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    kode_pesanan VARCHAR(40) UNIQUE NOT NULL,
    customer_id BIGINT NOT NULL REFERENCES users(id),
    driver_id BIGINT REFERENCES users(id),
    service_type_id BIGINT REFERENCES service_types(id),
    alamat_jemput TEXT NOT NULL,
    alamat_tujuan TEXT NOT NULL,
    jemput_lat NUMERIC(10,7),
    jemput_lng NUMERIC(10,7),
    tujuan_lat NUMERIC(10,7),
    tujuan_lng NUMERIC(10,7),
    jarak_km NUMERIC(8,2),
    tarif NUMERIC(12,2) NOT NULL DEFAULT 0,
    metode_pembayaran VARCHAR(20) NOT NULL DEFAULT 'cash'
        CHECK (metode_pembayaran = 'cash'),
    status_pembayaran VARCHAR(20) NOT NULL DEFAULT 'unpaid'
        CHECK (status_pembayaran IN ('unpaid', 'paid')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled')),
    commission_rate NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    commission_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
        CHECK (commission_status IN ('unpaid', 'paid', 'waived')),
    catatan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tarif >= 0),
    CHECK (commission_amount >= 0),
    CHECK (commission_rate BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    changed_by_user_id BIGINT REFERENCES users(id),
    changed_by_admin_id BIGINT REFERENCES admin_users(id),
    catatan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_no_hp ON users(no_hp);
CREATE INDEX IF NOT EXISTS idx_driver_status ON driver_profiles(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

COMMIT;
