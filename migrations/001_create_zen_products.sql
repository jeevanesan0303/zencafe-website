-- ============================================================
-- Zen Café — Phase 1: Products Database Schema & Initial Seed
-- Table: zen_products
-- ============================================================

CREATE TABLE IF NOT EXISTS zen_products (
  id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('food', 'drink')),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  serving VARCHAR(255) NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NULL,
  image TEXT NOT NULL DEFAULT '/assets/menu-panda-main.png',
  accent VARCHAR(16) NOT NULL DEFAULT '#a32722',
  available BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT TRUE,
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  spice_level VARCHAR(16) NULL CHECK (spice_level IS NULL OR spice_level IN ('none', 'mild', 'medium', 'hot')),
  dietary_type VARCHAR(16) NULL CHECK (dietary_type IS NULL OR dietary_type IN ('veg', 'non-veg')),
  dairy_type VARCHAR(16) NULL CHECK (dairy_type IS NULL OR dairy_type IN ('milk', 'milk-powder', 'dairy-free')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zen_products_kind_available ON zen_products (kind, available, featured);
CREATE INDEX IF NOT EXISTS idx_zen_products_category ON zen_products (category);

-- Seed existing default products (preserving existing product IDs)
INSERT INTO zen_products (
  id, kind, name, category, description, ingredients, serving, price, image, accent, available, featured, is_new, spice_level, dietary_type, dairy_type, created_at, updated_at
) VALUES
  (
    'zen-strawberry-cloud', 'drink', 'Zen Strawberry Cloud', 'Milkshake',
    'A creamy strawberry signature drink with a bright fruit finish and a premium Zen presentation.',
    'Strawberry, chilled milk, cream, house syrup', 'Served chilled', NULL,
    '/assets/signature-drinks/zen-drink-character-01.png', '#c43b5b', TRUE, TRUE, FALSE,
    NULL, NULL, 'milk', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
  ),
  (
    'zen-berry-bliss', 'drink', 'Zen Berry Bliss', 'Berry Special',
    'A smooth purple berry shake with a bold, refreshing fruit profile.',
    'Mixed berries, chilled milk, cream, house syrup', 'Served chilled', NULL,
    '/assets/signature-drinks/zen-drink-character-02.png', '#7a55c5', TRUE, TRUE, FALSE,
    NULL, NULL, 'milk', '2026-08-01T00:00:01.000Z', '2026-08-01T00:00:01.000Z'
  ),
  (
    'zen-choco-armor', 'drink', 'Zen Choco Armor', 'Chocolate',
    'A rich chocolate milkshake layered with cream and a deep café-style finish.',
    'Chocolate, chilled milk, cream, cocoa drizzle', 'Served chilled', NULL,
    '/assets/signature-drinks/zen-drink-character-03.png', '#8c5a42', TRUE, TRUE, FALSE,
    NULL, NULL, 'milk-powder', '2026-08-01T00:00:02.000Z', '2026-08-01T00:00:02.000Z'
  ),
  (
    'zen-citrus-mojito', 'drink', 'Zen Citrus Mojito', 'Mojito',
    'A cool citrus mojito with mint and lemon for a light, sparkling finish.',
    'Lemon, mint, soda, citrus syrup, ice', 'Served over ice · non-alcoholic', NULL,
    '/assets/signature-drinks/zen-drink-character-04.png', '#4a9a68', TRUE, TRUE, FALSE,
    NULL, NULL, 'dairy-free', '2026-08-01T00:00:03.000Z', '2026-08-01T00:00:03.000Z'
  ),
  (
    'zen-iced-brew', 'drink', 'Zen Iced Brew', 'Iced Coffee',
    'A chilled coffee creation with a soft premium finish and mellow café aroma.',
    'Coffee, chilled milk, ice, house sweetener', 'Served chilled', NULL,
    '/assets/signature-drinks/zen-drink-character-05.png', '#976544', TRUE, TRUE, FALSE,
    NULL, NULL, 'milk', '2026-08-01T00:00:04.000Z', '2026-08-01T00:00:04.000Z'
  ),
  (
    'zen-panda-welcome', 'food', 'Zen Panda Welcome', 'Signature',
    'The visual signature of Zen Kitchen and the opening hero of the restaurant experience.',
    'Zen Kitchen signature presentation', 'Featured restaurant welcome', NULL,
    '/assets/menu-panda-main.png', '#a32722', TRUE, TRUE, FALSE,
    'none', 'veg', NULL, '2026-08-01T00:01:00.000Z', '2026-08-01T00:01:00.000Z'
  ),
  (
    'samurai-feast-rice', 'food', 'Samurai Feast Rice', 'Rice Specials',
    'A generous spiced rice platter with roasted chicken, herbs and garnish.',
    'Seasoned rice, roasted chicken, herbs, cashews, house garnish', 'Main course · hearty serving', NULL,
    '/assets/menu-panda-rice.png', '#b14d2b', TRUE, TRUE, FALSE,
    'medium', 'non-veg', NULL, '2026-08-01T00:01:01.000Z', '2026-08-01T00:01:01.000Z'
  ),
  (
    'warrior-fire-wraps', 'food', 'Warrior Fire Wraps', 'Wraps',
    'Hot stuffed wraps with smoky filling, fresh herbs and sauce.',
    'Flatbread, seasoned filling, fresh herbs, vegetables, house sauce', 'Street-food style · warm', NULL,
    '/assets/menu-panda-wraps.png', '#9f241f', TRUE, TRUE, FALSE,
    'hot', 'non-veg', NULL, '2026-08-01T00:01:02.000Z', '2026-08-01T00:01:02.000Z'
  ),
  (
    'zen-street-dogs', 'food', 'Zen Street Dogs', 'Street Grill',
    'Grilled hot dogs with layered sauces and dips in a playful Zen Kitchen presentation.',
    'Grilled sausage, bun, fresh garnish, house sauces', 'Grill favourite · served warm', NULL,
    '/assets/menu-panda-dogs.png', '#a33f1f', TRUE, TRUE, FALSE,
    'mild', 'non-veg', NULL, '2026-08-01T00:01:03.000Z', '2026-08-01T00:01:03.000Z'
  ),
  (
    'black-armor-burger', 'food', 'Black Armor Burger Set', 'Burgers',
    'A full double burger and fries set with a premium café presentation.',
    'Burger bun, double filling, cheese, vegetables, fries, house dip', 'Main course · served with fries', NULL,
    '/assets/menu-panda-burger.png', '#7f2d19', TRUE, TRUE, FALSE,
    'mild', 'non-veg', NULL, '2026-08-01T00:01:04.000Z', '2026-08-01T00:01:04.000Z'
  )
ON CONFLICT (id) DO NOTHING;
