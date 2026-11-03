CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    no_hp VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'penumpang',
    status_online BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    passenger_id INT REFERENCES users(id),
    driver_id INT REFERENCES users(id),
    layanan VARCHAR(50) NOT NULL,
    pickup_address TEXT NOT NULL,
    dest_address TEXT NOT NULL,
    jarak_km DECIMAL(5,2) NOT NULL,
    tarif INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
