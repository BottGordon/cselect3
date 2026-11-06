-- Broad product groups from the project concept, with child categories that
-- keep the current storefront's filters usable during the transition.
insert into public.categories (name, slug, parent_id, display_order)
values
  ('Flood Evacuation & Personal Safety', 'flood-evacuation-safety', null, 1),
  ('Emergency Medical & Wound Care', 'medical-wound-care', null, 2),
  ('Water Sanitation & Hygiene', 'water-sanitation-hygiene', null, 3),
  ('Food, Warmth & Shelter', 'food-warmth-shelter', null, 4),
  ('Hardware, Power & Communication', 'hardware-power-communication', null, 5)
on conflict (slug) do update
set name = excluded.name,
    display_order = excluded.display_order;

with parent_groups(slug, name, parent_slug, display_order) as (
  values
    ('safety-gear', 'Safety Gear', 'flood-evacuation-safety', 1),
    ('emergency-lighting', 'Emergency Lighting', 'flood-evacuation-safety', 2),
    ('medical-first-aid', 'Medical & First Aid', 'medical-wound-care', 1),
    ('water-purification', 'Water Purification', 'water-sanitation-hygiene', 1),
    ('emergency-food', 'Emergency Food', 'food-warmth-shelter', 1),
    ('shelter-apparel', 'Shelter & Apparel', 'food-warmth-shelter', 2),
    ('emergency-power', 'Emergency Power', 'hardware-power-communication', 1),
    ('emergency-communications', 'Emergency Communications', 'hardware-power-communication', 2),
    ('tools-equipment', 'Tools & Equipment', 'hardware-power-communication', 3),
    ('barangay-bundles', 'Barangay Bundles', 'flood-evacuation-safety', 3)
)
insert into public.categories (name, slug, parent_id, display_order)
select child.name, child.slug, parent.id, child.display_order
from parent_groups as child
join public.categories as parent on parent.slug = child.parent_slug
on conflict (slug) do update
set name = excluded.name,
    parent_id = excluded.parent_id,
    display_order = excluded.display_order;



-- Demo catalog copied from the updated storefront. Replace illustrative prices,
-- descriptions, and stock with approved business data before public use.
insert into public.products (id, sku, category_id, name, description, price, stock_quantity)
select seed.id, seed.sku, category.id, seed.name, seed.description, seed.price, seed.stock_quantity
from (values
  (1, 'DEMO-001', 'safety-gear', 'Heavy-Duty 10L Dry Bag', 'Waterproof roll-top storage for your essentials', 250.00, 2),
  (2, 'DEMO-002', 'medical-first-aid', 'Waterproof First Aid Kit', 'Essential sterile dressings, trauma shears, antiseptics', 490.00, 54),
  (3, 'DEMO-003', 'water-purification', 'Straw Water Filter', 'Removes 99.9% of waterborne pathogens', 350.00, 71),
  (4, 'DEMO-004', 'shelter-apparel', 'Thermal Emergency Blanket', 'Mylar heat-retaining blanket, pocket size', 85.00, 88),
  (5, 'DEMO-005', 'safety-gear', 'Reflective Life Vest', 'High-visibility flotation vest with whistle', 290.00, 105),
  (6, 'DEMO-006', 'emergency-power', 'Solar Hand-Crank Radio', 'AM/FM/WB radio, flashlight, USB powerbank', 1250.00, 122),
  (7, 'DEMO-007', 'shelter-apparel', 'Emergency Rain Poncho', 'Lightweight waterproof cover for sudden downpours', 180.00, 139),
  (8, 'DEMO-008', 'barangay-bundles', 'Family 4-Person Go-Bag Bundle', 'A ready-to-go emergency kit for the whole household', 3800.00, 2),
  (11, 'DEMO-011', 'medical-first-aid', 'Compact Trauma First Aid Kit', 'Portable first-aid kit for cuts, burns, and wound care during floods', 720.00, 76),
  (12, 'DEMO-012', 'medical-first-aid', 'Waterproof Medical Pouch', 'Sealed pouch for prescriptions and essential medicines', 240.00, 120),
  (13, 'DEMO-013', 'medical-first-aid', 'Israeli Emergency Bandage', 'Pressure dressing for emergency wound control and bleeding', 220.00, 92),
  (14, 'DEMO-014', 'medical-first-aid', 'CPR Face Shield Pack', 'Barrier shield for emergency resuscitation and first response', 180.00, 160),
  (15, 'DEMO-015', 'medical-first-aid', 'Burn Care Dressing Set', 'Sterile dressings and gel for burn treatment after fires or heat exposure', 340.00, 54),
  (16, 'DEMO-016', 'medical-first-aid', 'Splint and Wrap Kit', 'Malleable splint and bandage set for injuries during evacuation', 420.00, 45),
  (17, 'DEMO-017', 'medical-first-aid', 'Emergency Medical Gloves (10 pairs)', 'Protective gloves for first aid and cleanup in flooded areas', 190.00, 200),
  (18, 'DEMO-018', 'medical-first-aid', 'Compact First Aid Shears', 'Blunt-tip shears for cutting clothing and bandages quickly', 150.00, 138),
  (19, 'DEMO-019', 'water-purification', 'Gravity Water Filter Bag', 'Portable water filtration for households and community emergency response', 1850.00, 38),
  (20, 'DEMO-020', 'water-purification', 'Water Purification Tablets (50)', 'Emergency treatment tablets for collected or uncertain water', 300.00, 210),
  (21, 'DEMO-021', 'water-purification', 'Collapsible Water Container 10L', 'Foldable container for safe drinking water storage', 420.00, 112),
  (22, 'DEMO-022', 'water-purification', 'Portable Water Test Kit', 'Quick check for water quality during floods and contamination events', 580.00, 48),
  (23, 'DEMO-023', 'water-purification', 'Stainless Steel Water Bottle 1L', 'Reusable bottle for safe drinking during evacuation and daily use', 500.00, 84),
  (24, 'DEMO-024', 'water-purification', 'Waterproof Water Storage Drum 20L', 'Lidded storage drum for clean water reserve at home', 1050.00, 34),
  (25, 'DEMO-025', 'water-purification', 'Replacement Filter Cartridge', 'Replacement cartridge for gravity filtration kits', 660.00, 63),
  (26, 'DEMO-026', 'water-purification', 'Sterile Water Pouch 12L', 'Sealed clean-water pouch for emergency drinking and sanitation', 230.00, 170),
  (27, 'DEMO-027', 'water-purification', 'Hand Sanitizer Refill', 'Travel-size sanitizer refill for family kits and shelters', 170.00, 260),
  (28, 'DEMO-028', 'water-purification', 'Portable Toilet Kit', 'Compact sanitation kit for flood evacuations and temporary shelters', 260.00, 110),
  (29, 'DEMO-029', 'water-purification', 'Hygiene Wet Wipes Pack', 'Disinfecting wipes for cleanup after floods and storms', 100.00, 280),
  (30, 'DEMO-030', 'water-purification', 'UV Water Purifier Pen', 'Portable UV purifier for treating small amounts of water', 590.00, 65),
  (31, 'DEMO-031', 'emergency-food', 'Emergency Food Ration Bar', 'High-energy ration bar for quick nutrition during emergencies', 200.00, 240),
  (32, 'DEMO-032', 'emergency-food', 'Ready-to-Eat Rice Meal Pack', 'Shelf-stable rice pack for households in flood response', 180.00, 175),
  (33, 'DEMO-033', 'emergency-food', 'Family Emergency Food Pack', 'Short-term food reserve for households during disruption', 1350.00, 46),
  (34, 'DEMO-034', 'emergency-food', 'Stainless Mess Kit', 'Compact cook-and-eat set for evacuation and shelter prep', 550.00, 75),
  (35, 'DEMO-035', 'emergency-food', 'Manual Can Opener', 'Compact steel opener for canned emergency food supplies', 110.00, 140),
  (36, 'DEMO-036', 'shelter-apparel', 'Compact Emergency Tent', 'Lightweight shelter for temporary evacuation and flood relief use', 2550.00, 21),
  (37, 'DEMO-037', 'shelter-apparel', 'Insulated Emergency Sleeping Bag', 'Reflective sleeping bag for cold and wet emergency conditions', 720.00, 42),
  (38, 'DEMO-038', 'shelter-apparel', 'Quick-Dry Thermal Socks', 'Warm, moisture-wicking socks for evacuation kits', 240.00, 130),
  (39, 'DEMO-039', 'emergency-lighting', 'Waterproof Headlamp', 'Hands-free LED light for emergency response and evacuation', 480.00, 92),
  (40, 'DEMO-040', 'emergency-lighting', 'Rechargeable LED Lantern', 'Wide-area lighting with USB rechargeable battery', 820.00, 57),
  (41, 'DEMO-041', 'emergency-lighting', 'Waterproof Flashlight', 'Sealed flashlight for flood and power-outage emergencies', 350.00, 86),
  (42, 'DEMO-042', 'emergency-lighting', 'Solar Emergency Light', 'Portable light for charging and illumination during outages', 610.00, 65),
  (43, 'DEMO-043', 'emergency-lighting', 'Rechargeable Safety Beacon', 'Flashing safety beacon for visibility in evacuation routes', 670.00, 40),
  (44, 'DEMO-044', 'emergency-communications', 'Two-Way Radio Pair', 'Short-range communication for families and response teams', 1750.00, 27),
  (45, 'DEMO-045', 'emergency-communications', 'Waterproof Phone Pouch', 'Touch-compatible pouch for phones and small valuables', 170.00, 155),
  (46, 'DEMO-046', 'emergency-power', 'Foldable Solar Charger 20W', 'Portable panel for charging USB devices during outages', 2450.00, 24),
  (47, 'DEMO-047', 'emergency-power', 'Rechargeable Battery Set', 'AA and AAA batteries with rechargeable charging option', 680.00, 72),
  (48, 'DEMO-048', 'emergency-power', 'Solar USB Power Bank', 'Compact solar charging bank for phones and lights', 1250.00, 52),
  (49, 'DEMO-049', 'tools-equipment', 'Heavy-Duty Utility Rope 20m', 'Weather-resistant rope for shelter hanging and rescue aid', 360.00, 66),
  (50, 'DEMO-050', 'tools-equipment', 'Folding Multi-Tool', 'Compact pliers, blade, and screwdriver tool for field repairs', 620.00, 50),
  (51, 'DEMO-051', 'tools-equipment', 'Compact Shovel', 'Folding shovel for clearing mud and debris after flooding', 760.00, 33),
  (52, 'DEMO-052', 'water-purification', 'Portable Hygiene Kit', 'Soap, sanitizer, wipes, and toiletries for emergency sanitation', 390.00, 75)
) as seed(id, sku, category_slug, name, description, price, stock_quantity)
join public.categories as category on category.slug = seed.category_slug
on conflict (id) do update
set sku = excluded.sku, category_id = excluded.category_id, name = excluded.name,
    description = excluded.description, price = excluded.price,
    stock_quantity = excluded.stock_quantity;

update public.products
set is_kit_bag = (sku = 'DEMO-001')
where sku like 'DEMO-%';

-- These storage paths match the updated product images. Upload the same files
-- to the product-images bucket before switching the UI to Storage URLs.
insert into public.product_images (product_id, storage_path, alt_text, display_order, is_primary)
values
  (1, 'products/1/Safety Disaste Dry bags.webp', 'Heavy-Duty 10L Dry Bag', 0, true),
  (2, 'products/2/Waterproof first aid.png', 'Waterproof First Aid Kit', 0, true),
  (3, 'products/3/Waterfilter Straw.png', 'Straw Water Filter', 0, true),
  (4, 'products/4/Thermal Blanket.png', 'Thermal Emergency Blanket', 0, true),
  (5, 'products/5/MultiColorLifeJacket.webp', 'Reflective Life Vest', 0, true),
  (6, 'products/6/CrankRadio.png', 'Solar Hand-Crank Radio', 0, true),
  (7, 'products/7/Poncho.webp', 'Emergency Rain Poncho', 0, true),
  (8, 'products/8/FamilyBundleBag.webp', 'Family 4-Person Go-Bag Bundle', 0, true),
  (11, 'products/11/Compact Trauma First Aid Kit.webp', 'Compact Trauma First Aid Kit', 0, true),
  (12, 'products/12/Waterproof Medical Pouch.png', 'Waterproof Medical Pouch', 0, true),
  (13, 'products/13/Israeli Emergency Bandage.webp', 'Israeli Emergency Bandage', 0, true),
  (14, 'products/14/CPR Face Shield Pack.webp', 'CPR Face Shield Pack', 0, true),
  (15, 'products/15/Burn Care Dressing Set.webp', 'Burn Care Dressing Set', 0, true),
  (16, 'products/16/Splint and Wrap Kit.webp', 'Splint and Wrap Kit', 0, true),
  (17, 'products/17/Emergency Medical Gloves (10 pairs).webp', 'Emergency Medical Gloves (10 pairs)', 0, true),
  (18, 'products/18/Compact First Aid Shears.webp', 'Compact First Aid Shears', 0, true),
  (19, 'products/19/Gravity Water Filter Bag.webp', 'Gravity Water Filter Bag', 0, true),
  (20, 'products/20/Water Purification Tablets(50).png', 'Water Purification Tablets (50)', 0, true),
  (21, 'products/21/Collapsible Water Container 10L.webp', 'Collapsible Water Container 10L', 0, true),
  (22, 'products/22/Portable Water Test Kit.webp', 'Portable Water Test Kit', 0, true),
  (23, 'products/23/Stainless Steel Water Bottle 1L.webp', 'Stainless Steel Water Bottle 1L', 0, true),
  (24, 'products/24/Waterproof Water Storage Drum 20L.webp', 'Waterproof Water Storage Drum 20L', 0, true),
  (25, 'products/25/Replacement Filter Cartridge.webp', 'Replacement Filter Cartridge', 0, true),
  (26, 'products/26/Sterile Water Pouch 12L.webp', 'Sterile Water Pouch 12L', 0, true),
  (27, 'products/27/Hand Sanitizer Refill.png', 'Hand Sanitizer Refill', 0, true),
  (28, 'products/28/Portable Toilet Kit.webp', 'Portable Toilet Kit', 0, true),
  (29, 'products/29/Hygiene Wet Wipes Pack.webp', 'Hygiene Wet Wipes Pack', 0, true),
  (30, 'products/30/UV Water Purifier Pen.webp', 'UV Water Purifier Pen', 0, true),
  (31, 'products/31/Emergency Food Ration Bar.webp', 'Emergency Food Ration Bar', 0, true),
  (32, 'products/32/Ready-to-Eat Rice Meal Pack.webp', 'Ready-to-Eat Rice Meal Pack', 0, true),
  (33, 'products/33/Family Emergency Food Pack.webp', 'Family Emergency Food Pack', 0, true),
  (34, 'products/34/Stainless Mess Kit.webp', 'Stainless Mess Kit', 0, true),
  (35, 'products/35/Manual Can Opener.png', 'Manual Can Opener', 0, true),
  (36, 'products/36/Compact Emergency Tent.png', 'Compact Emergency Tent', 0, true),
  (37, 'products/37/Insulated Emergency Sleeping Bag.webp', 'Insulated Emergency Sleeping Bag', 0, true),
  (38, 'products/38/Quick-Dry Thermal Socks.webp', 'Quick-Dry Thermal Socks', 0, true),
  (39, 'products/39/Waterproof Headlamp.png', 'Waterproof Headlamp', 0, true),
  (40, 'products/40/Rechargeable LED Lantern.webp', 'Rechargeable LED Lantern', 0, true),
  (41, 'products/41/Waterproof Flashlight.png', 'Waterproof Flashlight', 0, true),
  (42, 'products/42/Solar Emergency Light.png', 'Solar Emergency Light', 0, true),
  (43, 'products/43/Rechargeable Safety Beacon.png', 'Rechargeable Safety Beacon', 0, true),
  (44, 'products/44/Two-Way Radio Pair.webp', 'Two-Way Radio Pair', 0, true),
  (45, 'products/45/Waterproof Phone Pouch.webp', 'Waterproof Phone Pouch', 0, true),
  (46, 'products/46/Foldable Solar Charger 20W.webp', 'Foldable Solar Charger 20W', 0, true),
  (47, 'products/47/Rechargeable Battery Set.png', 'Rechargeable Battery Set', 0, true),
  (48, 'products/48/Solar USB Power Bank.png', 'Solar USB Power Bank', 0, true),
  (49, 'products/49/Heavy-Duty Utility Rope 20m.webp', 'Heavy-Duty Utility Rope 20m', 0, true),
  (50, 'products/50/Folding Multi-Tool.webp', 'Folding Multi-Tool', 0, true),
  (51, 'products/51/Compact Shovel.webp', 'Compact Shovel', 0, true),
  (52, 'products/52/Portable Hygiene Kit.webp', 'Portable Hygiene Kit', 0, true)
on conflict (storage_path) do update
set product_id = excluded.product_id, alt_text = excluded.alt_text,
    display_order = excluded.display_order, is_primary = excluded.is_primary;

select setval(pg_get_serial_sequence('public.products', 'id'),
  greatest(coalesce((select max(id) from public.products), 1), 1), true);
