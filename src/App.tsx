import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'
import ProductArtwork from './ProductArtwork'
import GoogleRoutePreview from './GoogleRoutePreview'
import './App.css'

const aquaLogo = '/AquaShield-mark.png'

type Category = string
type AuthPage =
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'reset-password'
  | 'register-success'
  | 'account-locked'
  | null

const initialAuthPage = (): AuthPage => {
  if (window.location.pathname === '/login') return 'login'
  if (window.location.pathname === '/signup') return 'signup'
  if (window.location.pathname === '/forgot-password') return 'forgot-password'
  if (window.location.pathname === '/reset-password') return 'reset-password'
  if (window.location.pathname === '/register-success') return 'register-success'
  if (window.location.pathname === '/account-locked') return 'account-locked'
  return null
}

const initialSearchQuery = () => new URLSearchParams(window.location.search).get('q') ?? ''
const initialStockCheckPage = () => window.location.pathname === '/checkout/inventory'
const initialCheckoutPage = () =>
  window.location.pathname.startsWith('/checkout/') && window.location.pathname !== '/checkout/inventory'
type AccountPage = 'orders' | 'track' | 'admin' | 'invoice' | 'addresses' | null
type AdminSection = 'overview' | 'orders' | 'customers' | 'fulfillment' | 'inventory' | 'categories' | 'reports'
type AdminCustomer = { id: string; firstName: string; lastName: string; username: string | null; role: 'admin' | 'buyer'; email: string; createdAt: string | null }
const stockAvailabilityLabel = (stock: number) => stock < 1 ? 'Out of stock' : stock <= 10 ? 'Low stock' : 'In stock'
const initialAccountPage = (): AccountPage => {
  if (window.location.pathname === '/orders') return 'orders'
  if (window.location.pathname === '/track-order') return 'track'
  if (window.location.pathname === '/admin') return 'admin'
  if (window.location.pathname === '/invoice') return 'invoice'
  if (window.location.pathname === '/addresses') return 'addresses'
  return null
}
const initialTrackingOrderId = () => new URLSearchParams(window.location.search).get('order') ?? ''
type ProductRouteView = 'detail' | 'reviews' | 'write-review'
type ProductRoute = { productId: number; view: ProductRouteView } | null
const getProductRoute = (): ProductRoute => {
  const match = window.location.pathname.match(/^\/product\/(\d+)(?:\/(reviews|review))?$/)
  if (!match) return null
  return {
    productId: Number(match[1]),
    view: match[2] === 'reviews' ? 'reviews' : match[2] === 'review' ? 'write-review' : 'detail',
  }
}

type CustomerReview = {
  name: string
  title: string
  text: string
  rating: number
  date: string
  recommended: boolean
}

type Product = {
  id: number
  name: string
  description: string
  category: Category
  price: number
  image: string
  stock: number
  organizationDiscountPrice: number
  badge?: string
  stockWarning?: boolean
  inventoryStatus?: 'available' | 'low-stock'
  isKitBag?: boolean
}

type ProductSeed = Omit<Product, 'image' | 'stock' | 'organizationDiscountPrice'> & { stock?: number }

type AudienceType = 'solo' | 'organization'

const getBulkDiscount = (quantity: number) => quantity >= 100 ? 0.15 : quantity >= 50 ? 0.1 : quantity >= 20 ? 0.05 : 0
const categorySlug = (name: string) => name.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const SALES_TAX_RATE = 0.12
const ACCOUNT_STORAGE_KEY = 'aquashield.accounts.v1'
const DEMO_DATA_STORAGE_KEY = 'aquashield.demo-data.v1'
const PASSWORD_HASH_ITERATIONS = 310_000

type LocalAccount = {
  email: string
  firstName: string
  lastName: string
  username: string
  passwordSalt: string
  passwordHash: string
}

function isLocalAccount(value: unknown): value is LocalAccount {
  if (typeof value !== 'object' || value === null) return false
  const account = value as Record<string, unknown>
  return ['email', 'firstName', 'lastName', 'username', 'passwordSalt', 'passwordHash']
    .every((key) => typeof account[key] === 'string')
}

function readLocalAccounts(): LocalAccount[] {
  const storedAccounts = window.localStorage.getItem(ACCOUNT_STORAGE_KEY)
  if (storedAccounts === null) return []
  const parsedAccounts: unknown = JSON.parse(storedAccounts)
  if (!Array.isArray(parsedAccounts) || !parsedAccounts.every(isLocalAccount)) {
    throw new Error('Saved account data is invalid. Clear this site’s stored data and create the account again.')
  }
  return parsedAccounts
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sanitizeName(value: string, limit = 20) {
  return value.replace(/[^\p{L}\s]/gu, '').slice(0, limit)
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const hash = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PASSWORD_HASH_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return bytesToHex(new Uint8Array(hash))
}

type OrderRecord = {
  id: string
  databaseId?: string
  items: { product: Product; quantity: number }[]
  subtotal: number
  tax: number
  shipping: number
  total: number
  contactName: string
  email: string
  phone: string
  address: string
  deliveryMethod: string
  paymentMethod: string
  status: 'Awaiting payment' | 'Processing' | 'Packed' | 'Shipped' | 'Out for delivery' | 'Delivered' | 'Cancelled'
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded'
  createdAt: string
  deliveryAddress?: {
    addressLine1: string
    addressLine2: string
    city: string
    province: string
    postalCode: string
  }
}

type SavedAddress = {
  id: string
  label: string
  recipientName: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  province: string
  postalCode: string
}

type NewProductInput = {
  name: string
  description: string
  category: Category
  price: number
  stock: number
}

type SupabaseOrderRow = {
  id: string
  order_number: string
  status: string
  payment_status?: string
  payment_method: string
  delivery_method: string
  contact_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  province: string
  postal_code: string
  subtotal: number | string
  vat_amount: number | string
  shipping_amount: number | string
  total: number | string
  created_at: string
  order_items: Array<{
    product_id: number | null
    product_name_snapshot: string
    unit_price: number | string
    quantity: number
    line_total: number | string
    is_gift?: boolean
  }>
}

function orderFromDatabase(row: SupabaseOrderRow, catalog: Product[]): OrderRecord {
  const databaseStatusToUi: Record<string, OrderRecord['status']> = {
    awaiting_payment: 'Awaiting payment',
    processing: 'Processing',
    packed: 'Packed',
    shipped: 'Shipped',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  const paymentMethod = row.payment_method === 'cash_on_delivery'
    ? 'Cash on Delivery'
    : row.payment_method === 'maya' ? 'Maya' : 'GCash'
  const deliveryMethod = row.delivery_method === 'priority_dispatch'
    ? 'Priority Dispatch'
    : row.delivery_method === 'barangay_hub_pickup' ? 'Barangay / Hub Pickup' : 'Standard Nationwide'
  const items = (row.order_items ?? []).map((item) => {
    const product = catalog.find((candidate) => candidate.id === item.product_id)
    const price = item.quantity > 0 ? Number(item.line_total) / item.quantity : Number(item.unit_price)
    return {
      product: product
        ? { ...product, name: item.product_name_snapshot, price }
        : {
            id: item.product_id ?? 0,
            name: item.product_name_snapshot,
            description: '',
            category: 'Barangay Bundles' as Category,
            price,
            image: makeProductImage(item.product_id ?? 0, item.product_name_snapshot, 'Barangay Bundles'),
            stock: 0,
            organizationDiscountPrice: price,
          },
      quantity: item.quantity,
    }
  })
  const address = [row.address_line1, row.address_line2, row.city, row.province, row.postal_code]
    .filter(Boolean)
    .join(', ')
  return {
    id: row.order_number,
    databaseId: row.id,
    items,
    subtotal: Number(row.subtotal),
    tax: Number(row.vat_amount),
    shipping: Number(row.shipping_amount),
    total: Number(row.total),
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address,
    deliveryMethod,
    paymentMethod,
    status: databaseStatusToUi[row.status] ?? 'Processing',
    paymentStatus: row.payment_status === 'paid' ? 'paid' : row.payment_status === 'failed' ? 'failed' : row.payment_status === 'refunded' ? 'refunded' : 'pending',
    createdAt: new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(row.created_at)),
    deliveryAddress: {
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      province: row.province,
      postalCode: row.postal_code,
    },
  }
}

const baseProducts = [
  {
    id: 1,
    name: 'Heavy-Duty 10L Dry Bag',
    description: 'Waterproof roll-top storage for your essentials',
    category: 'Safety Gear',
    price: 250,
    stockWarning: true,
  },
  {
    id: 2,
    name: 'Waterproof First Aid Kit',
    description: 'Essential sterile dressings, trauma shears, antiseptics',
    category: 'Medical & First Aid',
    price: 490,
  },
  {
    id: 3,
    name: 'Straw Water Filter',
    description: 'Removes 99.9% of waterborne pathogens',
    category: 'Water Purification',
    price: 350,
  },
  {
    id: 4,
    name: 'Thermal Emergency Blanket',
    description: 'Mylar heat-retaining blanket, pocket size',
    category: 'Shelter & Apparel',
    price: 85,
    inventoryStatus: 'low-stock',
  },
  {
    id: 5,
    name: 'Reflective Life Vest',
    description: 'High-visibility flotation vest with whistle',
    category: 'Safety Gear',
    price: 290,
  },
  {
    id: 6,
    name: 'Solar Hand-Crank Radio',
    description: 'AM/FM/WB radio, flashlight, USB powerbank',
    category: 'Emergency Power',
    price: 1250,
  },
  {
    id: 7,
    name: 'Emergency Rain Poncho',
    description: 'Lightweight waterproof cover for sudden downpours',
    category: 'Shelter & Apparel',
    price: 180,
  },
  {
    id: 8,
    name: 'Family 4-Person Go-Bag Bundle',
    description: 'A ready-to-go emergency kit for the whole household',
    category: 'Barangay Bundles',
    price: 3800,
    stockWarning: true,
  },
] satisfies ProductSeed[]

const additionalProductData: [string, string, Category, number, number][] = [
  ['Compact Trauma First Aid Kit', 'Portable first-aid kit for cuts, burns, and wound care during floods', 'Medical & First Aid', 720, 76],
  ['Waterproof Medical Pouch', 'Sealed pouch for prescriptions and essential medicines', 'Medical & First Aid', 240, 120],
  ['Israeli Emergency Bandage', 'Pressure dressing for emergency wound control and bleeding', 'Medical & First Aid', 220, 92],
  ['CPR Face Shield Pack', 'Barrier shield for emergency resuscitation and first response', 'Medical & First Aid', 180, 160],
  ['Burn Care Dressing Set', 'Sterile dressings and gel for burn treatment after fires or heat exposure', 'Medical & First Aid', 340, 54],
  ['Splint and Wrap Kit', 'Malleable splint and bandage set for injuries during evacuation', 'Medical & First Aid', 420, 45],
  ['Emergency Medical Gloves (10 pairs)', 'Protective gloves for first aid and cleanup in flooded areas', 'Medical & First Aid', 190, 200],
  ['Compact First Aid Shears', 'Blunt-tip shears for cutting clothing and bandages quickly', 'Medical & First Aid', 150, 138],
  ['Gravity Water Filter Bag', 'Portable water filtration for households and community emergency response', 'Water Purification', 1850, 38],
  ['Water Purification Tablets (50)', 'Emergency treatment tablets for collected or uncertain water', 'Water Purification', 300, 210],
  ['Collapsible Water Container 10L', 'Foldable container for safe drinking water storage', 'Water Purification', 420, 112],
  ['Portable Water Test Kit', 'Quick check for water quality during floods and contamination events', 'Water Purification', 580, 48],
  ['Stainless Steel Water Bottle 1L', 'Reusable bottle for safe drinking during evacuation and daily use', 'Water Purification', 500, 84],
  ['Waterproof Water Storage Drum 20L', 'Lidded storage drum for clean water reserve at home', 'Water Purification', 1050, 34],
  ['Replacement Filter Cartridge', 'Replacement cartridge for gravity filtration kits', 'Water Purification', 660, 63],
  ['Sterile Water Pouch 12L', 'Sealed clean-water pouch for emergency drinking and sanitation', 'Water Purification', 230, 170],
  ['Hand Sanitizer Refill', 'Travel-size sanitizer refill for family kits and shelters', 'Water Purification', 170, 260],
  ['Portable Toilet Kit', 'Compact sanitation kit for flood evacuations and temporary shelters', 'Water Purification', 260, 110],
  ['Hygiene Wet Wipes Pack', 'Disinfecting wipes for cleanup after floods and storms', 'Water Purification', 100, 280],
  ['UV Water Purifier Pen', 'Portable UV purifier for treating small amounts of water', 'Water Purification', 590, 65],
  ['Emergency Food Ration Bar', 'High-energy ration bar for quick nutrition during emergencies', 'Emergency Food', 200, 240],
  ['Ready-to-Eat Rice Meal Pack', 'Shelf-stable rice pack for households in flood response', 'Emergency Food', 180, 175],
  ['Family Emergency Food Pack', 'Short-term food reserve for households during disruption', 'Emergency Food', 1350, 46],
  ['Ready-to-Eat Family Meal Kit', 'Balanced meal pack for emergency household use', 'Emergency Food', 1020, 41],
  ['Stainless Mess Kit', 'Compact cook-and-eat set for evacuation and shelter prep', 'Emergency Food', 550, 75],
  ['Manual Can Opener', 'Compact steel opener for canned emergency food supplies', 'Emergency Food', 110, 140],
  ['Compact Emergency Tent', 'Lightweight shelter for temporary evacuation and flood relief use', 'Shelter & Apparel', 2550, 21],
  ['Insulated Emergency Sleeping Bag', 'Reflective sleeping bag for cold and wet emergency conditions', 'Shelter & Apparel', 720, 42],
  ['Quick-Dry Thermal Socks', 'Warm, moisture-wicking socks for evacuation kits', 'Shelter & Apparel', 240, 130],
  ['Insulated Sleeping Pad', 'Foam pad for warmth and comfort during shelter use', 'Shelter & Apparel', 460, 63],
  ['Mylar Thermal Emergency Blanket', 'Compact blanket for insulation during storms and cold nights', 'Shelter & Apparel', 180, 150],
  ['Waterproof Dry Bag 30L', 'Roll-top dry bag for protecting valuables and flood gear', 'Safety Gear', 300, 96],
  ['Waterproof Work Gloves', 'Grip-enhanced gloves for cleanup and flood recovery work', 'Safety Gear', 310, 98],
  ['Rescue Whistle with Lanyard', 'High-volume whistle for alerting families during emergencies', 'Safety Gear', 90, 190],
  ['High-Visibility Safety Vest', 'Reflective vest for flood response, evacuation, and cleanup work', 'Safety Gear', 280, 110],
  ['Inflatable Rescue Throw Bag', 'Floating rescue line for water emergencies and flood response', 'Safety Gear', 660, 60],
  ['Emergency Fire Blanket', 'Heat-resistant blanket for quick fire response in disaster zones', 'Safety Gear', 240, 88],
  ['Waterproof Headlamp', 'Hands-free LED light for emergency response and evacuation', 'Emergency Lighting', 480, 92],
  ['Rechargeable LED Lantern', 'Wide-area lighting with USB rechargeable battery', 'Emergency Lighting', 820, 57],
  ['Waterproof Flashlight', 'Sealed flashlight for flood and power-outage emergencies', 'Emergency Lighting', 350, 86],
  ['Solar Emergency Light', 'Portable light for charging and illumination during outages', 'Emergency Lighting', 610, 65],
  ['Rechargeable Safety Beacon', 'Flashing safety beacon for visibility in evacuation routes', 'Emergency Lighting', 670, 40],
  ['Hand-Crank Emergency Radio', 'Battery-free radio for weather updates and emergency broadcasts', 'Emergency Communications', 1050, 41],
  ['Two-Way Radio Pair', 'Short-range communication for families and response teams', 'Emergency Communications', 1750, 27],
  ['Waterproof Phone Pouch', 'Touch-compatible pouch for phones and small valuables', 'Emergency Communications', 170, 155],
  ['Power Bank 20,000mAh', 'High-capacity backup charging for phones and essential devices', 'Emergency Power', 1520, 49],
  ['Foldable Solar Charger 20W', 'Portable panel for charging USB devices during outages', 'Emergency Power', 2450, 24],
  ['Rechargeable Battery Set', 'AA and AAA batteries with rechargeable charging option', 'Emergency Power', 680, 72],
  ['Solar USB Power Bank', 'Compact solar charging bank for phones and lights', 'Emergency Power', 1250, 52],
  ['Heavy-Duty Utility Rope 20m', 'Weather-resistant rope for shelter hanging and rescue aid', 'Tools & Equipment', 360, 66],
  ['Folding Multi-Tool', 'Compact pliers, blade, and screwdriver tool for field repairs', 'Tools & Equipment', 620, 50],
  ['Compact Shovel', 'Folding shovel for clearing mud and debris after flooding', 'Tools & Equipment', 760, 33],
  ['Emergency Water Storage Jerrican 20L', 'Leak-proof water reserve container for clean household storage', 'Water Purification', 560, 61],
  ['Portable Hygiene Kit', 'Soap, sanitizer, wipes, and toiletries for emergency sanitation', 'Water Purification', 390, 75],
  ['Emergency Sandbags', 'Flood barriers for home protection and drainage control', 'Shelter & Apparel', 130, 210],
  ['Waterproof Poncho Pack', 'Lightweight rain protection for households and evacuees', 'Shelter & Apparel', 160, 200],
  ['Diabetic Emergency Kit', 'Prepared glucose support and medication essentials for emergency diabetic care', 'Medical & First Aid', 690, 48],
  ['Saline Bottles', 'Sterile saline bottles for wound cleaning and emergency eye or skin irrigation', 'Medical & First Aid', 220, 120],
  ['Emergency Stretcher Sling', 'Portable sling support for moving injured persons during evacuation', 'Medical & First Aid', 610, 44],
  ['Wound Closure Strips', 'Sterile skin closure strips for minor cuts and lacerations', 'Medical & First Aid', 180, 150],
  ['Cold Pack Set', 'Reusable cold therapy packs for sprains, swelling, and minor injuries', 'Medical & First Aid', 260, 110],
  ['Burn Treatment Kit', 'Sterile burn care supplies for first response after heat or fire exposure', 'Medical & First Aid', 420, 60],
  ['Pulse Oximeter', 'Portable oxygen level monitor for field, home, or emergency assessment', 'Medical & First Aid', 950, 35],
  ['Portable Distiller', 'Compact distillation unit for converting unsafe water into clean water', 'Water Purification', 1980, 20],
  ['Soup & Instant Noodle Packs', 'Shelf-stable noodles and soup packs for quick hot meals in outages', 'Emergency Food', 260, 210],
  ['Oatmeal / Breakfast Packs', 'Easy breakfast meals for families during power outages and sheltering', 'Emergency Food', 210, 220],
  ['Protein Snack Packs', 'Shelf-stable protein snacks for longer emergency readiness', 'Emergency Food', 290, 240],
  ['Fruit Cup / Dessert Packs', 'Ready fruit and dessert servings with extended shelf life', 'Emergency Food', 240, 180],
  ['Baby Food Emergency Pack', 'Easy-to-prepare infant food set for family emergency kits', 'Emergency Food', 380, 65],
  ['Vegetarian Emergency Meal Pack', 'Plant-based emergency meal kit for households with dietary preferences', 'Emergency Food', 380, 130],
  ['Halal Emergency Meal Pack', 'Shelf-stable halal meal options for family and community preparedness', 'Emergency Food', 400, 110],
  ['Mosquito Repellent Kit', 'Bug protection essentials for evacuation centers and camps', 'Shelter & Apparel', 170, 230],
  ['Flood Boots', 'Water-resistant protective boots for flood response and cleanup work', 'Shelter & Apparel', 950, 55],
  ['Emergency Whistle Pack', 'High-volume whistle and attachment set for alerting households in emergencies', 'Safety Gear', 95, 180],
  ['Air Horn Alarm', 'High-decibel alert device for emergency communications and warning', 'Safety Gear', 190, 200],
  ['Glow Stick Bundle', 'Long-lasting emergency lighting for kits, bags, and shelters', 'Emergency Lighting', 130, 300],
  ['Car Jump Starter', 'Portable jump starter for vehicles in storm and flood emergencies', 'Emergency Power', 3200, 18],
  ['Reflective Safety Tape', 'Visible hazard marking tape for emergency routes and staging areas', 'Safety Gear', 120, 250],
  ['Signal Flare Pack', 'Visible distress signaling tools for nighttime emergencies and evacuation', 'Safety Gear', 340, 75],
  ['Pet Evacuation Carrier', 'Secure carrier for cats and small dogs during flood evacuation', 'Shelter & Apparel', 980, 42],
  ['Pet Food Emergency Pack', 'Shelf-stable meal packs for dogs and cats during flooding and outages', 'Emergency Food', 320, 78],
  ['Pet Water Bowl Set', 'Portable bowls and feeding set for pets in evacuation shelters', 'Shelter & Apparel', 180, 120],
  ['Pet Leash & Harness Set', 'Durable control set for safe pet movement in flood-risk areas', 'Safety Gear', 420, 70],
  ['Pet First Aid Kit', 'Emergency care essentials for cats and dogs during disasters', 'Medical & First Aid', 540, 53],
  ['Pet Hygiene Wipes', 'Quick-cleaning wipes for pets after floodwater exposure', 'Water Purification', 160, 150],
  ['Infant Hygiene Kit', 'Baby-safe sanitation essentials for infants during flood emergencies', 'Water Purification', 290, 95],
  ['Infant Water Bottle Set', 'Leak-proof water bottles and feeding accessories for children', 'Water Purification', 250, 110],
  ['Children’s Emergency Rain Suit', 'Waterproof rain suit for kids during flood evacuation and rain exposure', 'Shelter & Apparel', 620, 62],
  ['Child Safety Wristband', 'Identification wristband for children during evacuation and sheltering', 'Safety Gear', 110, 180],
  ['Infant Thermal Wrap', 'Warm protective wrap for babies during cold and wet emergency conditions', 'Shelter & Apparel', 310, 82],
  ['Children’s Safety Vest', 'Small reflective vest for kids in evacuation routes and public shelters', 'Safety Gear', 280, 100],
  ['Pediatric Thermal Blanket', 'Compact warming blanket sized for infants and young children', 'Shelter & Apparel', 210, 130],
  ['Pediatric Oral Rehydration Pack', 'Electrolyte and rehydration supplies for child care in heat and flood conditions', 'Medical & First Aid', 360, 72],
  ['Emergency Infant Formula Pack', 'Ready-to-use infant feeding supplies for emergency household use', 'Emergency Food', 420, 58],
  ['Pet Rescue Float Vest', 'Floating safety vest for dogs during floodwater emergencies', 'Safety Gear', 680, 45],
  ['Portable Baby Crib Sheet Set', 'Clean, compact bed sheets for infant rest in shelters', 'Shelter & Apparel', 220, 100],
  ['Family Hygiene Sanitizer Bundle', 'Bulk sanitizer and cleaning essentials for children and parents', 'Water Purification', 300, 110],
  ['Children’s Waterproof Backpack', 'Small backpack for kids’ emergency essentials and comfort items', 'Shelter & Apparel', 420, 70],
  ['Baby Diaper Emergency Pack', 'Packing set for infant hygiene and care during shelter stays', 'Water Purification', 280, 90],
  ['Toddler Life Vest', 'Child-sized flotation aid for water emergencies and flood response', 'Safety Gear', 430, 60],
  ['Easy-Grip Walking Cane', 'Sturdy walking aid for seniors during evacuation and shelter movement', 'Shelter & Apparel', 520, 52],
  ['Wheelchair Rain Cover', 'Water-resistant cover protecting wheelchair users during floods and storms', 'Shelter & Apparel', 680, 44],
  ['Emergency Hearing Aid Kit', 'Compact storage and care kit for hearing-assist devices during emergencies', 'Medical & First Aid', 390, 48],
  ['Seat Cushion Comfort Pack', 'Pressure-relief cushion for elderly and PWD users during shelter stays', 'Shelter & Apparel', 440, 58],
  ['Wheelchair Battery Backup', 'Emergency battery support for powered mobility devices during outages', 'Emergency Power', 2100, 18],
  ['Senior Medication Organizer', 'Large-label organizer for elderly medicine schedules and emergency prescriptions', 'Medical & First Aid', 250, 95],
  ['Mobility Aid Storage Bag', 'Waterproof storage for canes, walkers, and mobility accessories', 'Shelter & Apparel', 260, 105],
]

function makeProductImage(id: number, name: string, category: Category): string {
  const colors: Partial<Record<Category, string>> = {
    'Medical & First Aid': '#d9433d',
    'Water Purification': '#3297b3',
    'Emergency Food': '#6f8b45',
    'Shelter & Apparel': '#e1a62b',
    'Safety Gear': '#f07824',
    'Emergency Power': '#405e78',
    'Emergency Lighting': '#f2b632',
    'Emergency Communications': '#5865a5',
    'Tools & Equipment': '#697984',
  }
  const label = name.replace(/[<>&"]/g, '').slice(0, 34)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320"><rect width="400" height="320" fill="#eef1f4"/><ellipse cx="200" cy="266" rx="105" ry="13" fill="#cbd2d8" opacity=".58"/><rect x="120" y="64" width="160" height="170" rx="22" fill="${colors[category] ?? '#536747'}" stroke="#26364b" stroke-width="8"/><circle cx="200" cy="145" r="34" fill="#fff" opacity=".9"/><text x="200" y="157" font-family="Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#26364b">${id}</text><text x="200" y="285" font-family="Arial,sans-serif" font-size="15" text-anchor="middle" fill="#26364b">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const productSeeds: ProductSeed[] = [
  ...baseProducts,
  ...additionalProductData
    .filter(([name]) => ![
      'Ready-to-Eat Family Meal Kit',
      'Insulated Sleeping Pad',
      'Mylar Thermal Emergency Blanket',
      'Waterproof Dry Bag 30L',
      'Waterproof Work Gloves',
      'Rescue Whistle with Lanyard',
      'High-Visibility Safety Vest',
      'Inflatable Rescue Throw Bag',
      'Emergency Fire Blanket',
      'Hand-Crank Emergency Radio',
      'Power Bank 20,000mAh',
      'Emergency Water Storage Jerrican 20L',
      'Waterproof Poncho Pack',
      'Emergency Sandbags',
    ].includes(name))
    .map(([name, description, category, price, stock], index) => ({
      id: index + 11,
      name,
      description,
      category,
      price,
      stock,
      stockWarning: stock < 30,
    })),
]

const firstEightProductImages: Record<number, string> = {
  1: '/Safety%20Disaste%20Dry%20bags.webp',
  2: '/Waterproof%20first%20aid.png',
  3: '/Waterfilter%20Straw.png',
  4: '/Thermal%20Blanket.png',
  5: '/MultiColorLifeJacket.webp',
  6: '/CrankRadio.png',
  7: '/Poncho.webp',
  8: '/FamilyBundleBag.webp',
}

const productNameImageMap: Record<string, string> = {
  'Compact Trauma First Aid Kit': '/Compact%20Trauma%20First%20Aid%20Kit.webp',
  'Waterproof Medical Pouch': '/Waterproof%20Medical%20Pouch.png',
  'Israeli Emergency Bandage': '/Israeli%20Emergency%20Bandage.webp',
  'CPR Face Shield Pack': '/CPR%20Face%20Shield%20Pack.webp',
  'Burn Care Dressing Set': '/Burn%20Care%20Dressing%20Set.webp',
  'Splint and Wrap Kit': '/Splint%20and%20Wrap%20Kit.webp',
  'Emergency Medical Gloves (10 pairs)': '/Emergency%20Medical%20Gloves%20(10%20pairs).webp',
  'Compact First Aid Shears': '/Compact%20First%20Aid%20Shears.webp',
  'Gravity Water Filter Bag': '/Gravity%20Water%20Filter%20Bag.webp',
  'Water Purification Tablets (50)': '/Water%20Purification%20Tablets(50).png',
  'Collapsible Water Container 10L': '/Collapsible%20Water%20Container%2010L.webp',
  'Portable Water Test Kit': '/Portable%20Water%20Test%20Kit.webp',
  'Stainless Steel Water Bottle 1L': '/Stainless%20Steel%20Water%20Bottle%201L.webp',
  'Waterproof Water Storage Drum 20L': '/Waterproof%20Water%20Storage%20Drum%2020L.webp',
  'Replacement Filter Cartridge': '/Replacement%20Filter%20Cartridge.webp',
  'Sterile Water Pouch 12L': '/Sterile%20Water%20Pouch%2012L.webp',
  'Hand Sanitizer Refill': '/Hand%20Sanitizer%20Refill.png',
  'Portable Toilet Kit': '/Portable%20Toilet%20Kit.webp',
  'Hygiene Wet Wipes Pack': '/Hygiene%20Wet%20Wipes%20Pack.webp',
  'UV Water Purifier Pen': '/UV%20Water%20Purifier%20Pen.webp',
  'Emergency Food Ration Bar': '/Emergency%20Food%20Ration%20Bar.webp',
  'Ready-to-Eat Rice Meal Pack': '/Ready-to-Eat%20Rice%20Meal%20Pack.webp',
  'Family Emergency Food Pack': '/Family%20Emergency%20Food%20Pack.webp',
  'Stainless Mess Kit': '/Stainless%20Mess%20Kit.webp',
  'Manual Can Opener': '/Manual%20Can%20Opener.png',
  'Compact Emergency Tent': '/Compact%20Emergency%20Tent.png',
  'Insulated Emergency Sleeping Bag': '/Insulated%20Emergency%20Sleeping%20Bag.webp',
  'Quick-Dry Thermal Socks': '/Quick-Dry%20Thermal%20Socks.webp',
  'Mylar Thermal Emergency Blanket': '/Thermal%20Blanket.png',
  'Waterproof Headlamp': '/Waterproof%20Headlamp.png',
  'Rechargeable LED Lantern': '/Rechargeable%20LED%20Lantern.webp',
  'Waterproof Flashlight': '/Waterproof%20Flashlight.png',
  'Solar Emergency Light': '/Solar%20Emergency%20Light.png',
  'Rechargeable Safety Beacon': '/Rechargeable%20Safety%20Beacon.png',
  'Hand-Crank Emergency Radio': '/CrankRadio.png',
  'Two-Way Radio Pair': '/Two-Way%20Radio%20Pair.webp',
  'Waterproof Phone Pouch': '/Waterproof%20Phone%20Pouch.webp',
  'Foldable Solar Charger 20W': '/Foldable%20Solar%20Charger%2020W.webp',
  'Rechargeable Battery Set': '/Rechargeable%20Battery%20Set.png',
  'Solar USB Power Bank': '/Solar%20USB%20Power%20Bank.png',
  'Heavy-Duty Utility Rope 20m': '/Heavy-Duty%20Utility%20Rope%2020m.webp',
  'Folding Multi-Tool': '/Folding%20Multi-Tool.webp',
  'Compact Shovel': '/Compact%20Shovel.webp',
  'Emergency Water Storage Jerrican 20L': '/Emergency%20Water%20Storage%20Jerrican%2020L.webp',
  'Portable Hygiene Kit': '/Portable%20Hygiene%20Kit.webp',
  'Waterproof Poncho Pack': '/Poncho.webp',
  'Diabetic Emergency Kit': '/Diabetic%20Emergency%20Kit.png',
  'Saline Bottles': '/Saline%20Bottles.webp',
  'Emergency Stretcher Sling': '/Emergency%20Stretcher%20Sling.jpg',
  'Wound Closure Strips': '/Wound%20Closure%20Strips.webp',
  'Cold Pack Set': '/Cold%20Pack%20Set.webp',
  'Burn Treatment Kit': '/Burn%20Treatment%20Kit.webp',
  'Pulse Oximeter': '/Pulse%20Oximeter.webp',
  'Portable Distiller': '/Portable%20Distiller.webp',
  'Soup & Instant Noodle Packs': '/Soup%20%26%20Instant%20Noodle%20Packs.webp',
  'Oatmeal / Breakfast Packs': '/Oatmeal%20Breakfast%20Packs.webp',
  'Protein Snack Packs': '/Protein%20Snack%20Packs.webp',
  'Fruit Cup / Dessert Packs': '/Fruit%20Cup%20Dessert%20Packs.png',
  'Baby Food Emergency Pack': '/Baby%20Food%20Emergency%20Pack.webp',
  'Vegetarian Emergency Meal Pack': '/Vegetarian%20Emergency%20Meal%20Pack.webp',
  'Halal Emergency Meal Pack': '/Halal%20Emergency%20Meal%20Pack.png',
  'Mosquito Repellent Kit': '/Mosquito%20Repellent%20Kit.webp',
  'Flood Boots': '/Flood%20Boots.webp',
  'Emergency Whistle Pack': '/Emergency%20Whistle%20Pack.webp',
  'Air Horn Alarm': '/Air%20Horn%20Alarm.png',
  'Glow Stick Bundle': '/Glow%20Stick%20Bundle.webp',
  'Car Jump Starter': '/Car%20Jump%20Starter.webp',
  'Reflective Safety Tape': '/Reflective%20Safety%20Tape.webp',
  'Signal Flare Pack': '/Signal%20Flare%20Pack.webp',
  'Pet Evacuation Carrier': '/Pet%20Evacuation%20Carrier.webp',
  'Pet Food Emergency Pack': '/Pet%20Food%20Emergency%20Pack.webp',
  'Pet Water Bowl Set': '/Pet%20Water%20Bowl%20Set.webp',
  'Pet Leash & Harness Set': '/Pet%20Leash%20%26%20Harness%20Set.webp',
  'Pet First Aid Kit': '/Pet%20First%20Aid%20Kit.webp',
  'Pet Hygiene Wipes': '/Pet%20Hygiene%20Wipes.webp',
  'Pet Rescue Float Vest': '/Pet%20Rescue%20Float%20Vest.webp',
  'Infant Hygiene Kit': '/Infant%20Hygiene%20Kit.webp',
  'Infant Water Bottle Set': '/Infant%20Water%20Bottle%20Set.png',
  'Children’s Emergency Rain Suit': '/Children%E2%80%99s%20Emergency%20Rain%20Suit.webp',
  'Children’s Safety Vest': '/Children%E2%80%99s%20Safety%20Vest.webp',
  'Child Safety Wristband': '/Child%20Safety%20Wristband.webp',
  'Infant Thermal Wrap': '/Infant%20Thermal%20Wrap.webp',
  'Pediatric Thermal Blanket': '/Pediatric%20Thermal%20Blanket.webp',
  'Pediatric Oral Rehydration Pack': '/Pediatric%20Oral%20Rehydration%20Pack.png',
  'Emergency Infant Formula Pack': '/Emergency%20Infant%20Formula%20Pack.png',
  'Portable Baby Crib Sheet Set': '/Portable%20Baby%20Crib%20Sheet%20Set.webp',
  'Family Hygiene Sanitizer Bundle': '/Family%20Hygiene%20Sanitizer%20Bundle.png',
  'Children’s Waterproof Backpack': '/Children%E2%80%99s%20Waterproof%20Backpack.webp',
  'Baby Diaper Emergency Pack': '/Baby%20Diaper%20Emergency%20Pack.webp',
  'Toddler Life Vest': '/Toddler%20Life%20Vest.webp',
  'Easy-Grip Walking Cane': '/Easy-Grip%20Walking%20Cane.png',
  'Wheelchair Rain Cover': '/Wheelchair%20Rain%20Cover.webp',
  'Emergency Hearing Aid Kit': '/Emergency%20Hearing%20Aid%20Kit.png',
  'Seat Cushion Comfort Pack': '/Seat%20Cushion%20Comfort%20Pack.webp',
  'Wheelchair Battery Backup': '/Wheelchair%20Battery%20Backup.webp',
  'Senior Medication Organizer': '/Senior%20Medication%20Organizer.png',
  'Mobility Aid Storage Bag': '/Mobility%20Aid%20Storage%20Bag.webp',
}

const demoProducts: Product[] = productSeeds.map((product) => ({
  ...product,
  image: productNameImageMap[product.name] ?? firstEightProductImages[product.id] ?? makeProductImage(product.id, product.name, product.category),
  stock: product.stock ?? (product.stockWarning ? 2 : 20 + (product.id * 17) % 231),
  organizationDiscountPrice: Math.round(product.price * 0.95),
  isKitBag: product.id === 1,
}))

const makeDemoCatalogSignature = () => JSON.stringify(demoProducts.map((product) => [
  product.id,
  product.name,
  product.category,
  product.price,
  product.stock,
  product.image,
]))

const categories = [
  'All items',
  'Medical & First Aid',
  'Water Purification',
  'Emergency Food',
  'Shelter & Apparel',
  'Safety Gear',
  'Emergency Power',
  'Emergency Lighting',
  'Emergency Communications',
  'Tools & Equipment',
  'Pets',
  'Infants & Children',
  'Elderly & PWDs',
  'Barangay Bundles',
] as const
type CategoryFilter = string

type SavedDemoData = {
  orders: OrderRecord[]
  products: Product[]
  inventory: Record<number, number>
  customerReviews: Record<number, CustomerReview[]>
  categories: string[]
  warning?: string
  preserveStoredData?: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSavedProduct(value: unknown): value is Product {
  if (!isPlainRecord(value)) return false
  return Number.isSafeInteger(value.id) && Number(value.id) > 0
    && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 120
    && typeof value.description === 'string' && value.description.length <= 600
    && typeof value.category === 'string' && value.category.trim().length > 0 && value.category.length <= 80
    && typeof value.price === 'number' && Number.isFinite(value.price) && value.price >= 0
    && typeof value.image === 'string'
    && typeof value.stock === 'number' && Number.isSafeInteger(value.stock) && value.stock >= 0
    && typeof value.organizationDiscountPrice === 'number' && Number.isFinite(value.organizationDiscountPrice)
}

function isSavedOrder(value: unknown): value is OrderRecord {
  if (!isPlainRecord(value)) return false
  const statuses: OrderRecord['status'][] = ['Awaiting payment', 'Processing', 'Packed', 'Shipped', 'Out for delivery', 'Delivered', 'Cancelled']
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 64
    && Array.isArray(value.items) && value.items.every((item) => isPlainRecord(item)
      && isSavedProduct(item.product)
      && typeof item.quantity === 'number' && Number.isSafeInteger(item.quantity) && item.quantity > 0)
    && ['subtotal', 'tax', 'shipping', 'total'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0)
    && ['contactName', 'email', 'phone', 'address', 'deliveryMethod', 'paymentMethod', 'createdAt'].every((key) => typeof value[key] === 'string')
    && statuses.includes(value.status as OrderRecord['status'])
}

function readSavedDemoData(): SavedDemoData {
  const defaults = {
    orders: [] as OrderRecord[],
    products: demoProducts,
    inventory: Object.fromEntries(demoProducts.map((product) => [product.id, product.stock])),
    customerReviews: {} as Record<number, CustomerReview[]>,
    categories: [...categories],
  }
  try {
    const stored = window.localStorage.getItem(DEMO_DATA_STORAGE_KEY)
    if (!stored) return defaults
    const parsed: unknown = JSON.parse(stored)
    if (!isPlainRecord(parsed)
      || !Array.isArray(parsed.orders) || !parsed.orders.every(isSavedOrder)
      || !Array.isArray(parsed.products) || !parsed.products.every(isSavedProduct)
      || !isPlainRecord(parsed.inventory)
      || !isPlainRecord(parsed.customerReviews)
      || (parsed.categories !== undefined && (!Array.isArray(parsed.categories) || !parsed.categories.every((category) => typeof category === 'string' && category.trim().length > 0)))) {
      return { ...defaults, warning: 'Saved browser data could not be read. The product catalog is shown; existing browser data was left untouched.', preserveStoredData: true }
    }
    const storedCatalogSignature = typeof parsed.catalogSignature === 'string' ? parsed.catalogSignature : ''
    if (storedCatalogSignature !== makeDemoCatalogSignature()) {
      window.localStorage.removeItem(DEMO_DATA_STORAGE_KEY)
      return defaults
    }
    const storedProductIds = new Set((parsed.products as Product[]).map((product) => product.id))
    const productIds = storedProductIds
    const inventory = Object.fromEntries(Object.entries(parsed.inventory).flatMap(([id, quantity]) => {
      const productId = Number(id)
      return productIds.has(productId) && typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 0
        ? [[productId, quantity]]
        : []
    }))
    const products = (parsed.products as Product[]).map((product) => ({
      ...product,
      image: productNameImageMap[product.name] ?? firstEightProductImages[product.id] ?? product.image ?? makeProductImage(product.id, product.name, product.category),
      stock: inventory[product.id] ?? product.stock,
      stockWarning: (inventory[product.id] ?? product.stock) <= 10,
    }))
    const customerReviews = Object.fromEntries(Object.entries(parsed.customerReviews).flatMap(([id, reviews]) => {
      if (!productIds.has(Number(id)) || !Array.isArray(reviews)) return []
      const validReviews = reviews.filter((review): review is CustomerReview => isPlainRecord(review)
        && typeof review.name === 'string' && typeof review.title === 'string'
        && typeof review.text === 'string' && typeof review.rating === 'number'
        && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5
        && typeof review.date === 'string' && typeof review.recommended === 'boolean')
      return [[Number(id), validReviews]]
    }))
    const savedCategories = Array.isArray(parsed.categories)
      ? [...new Set(parsed.categories.map((category) => String(category).trim()).filter(Boolean))]
      : [...categories]
    return { orders: parsed.orders as OrderRecord[], products, inventory, customerReviews, categories: savedCategories }
  } catch {
    return { ...defaults, warning: 'Browser storage is unavailable. Changes may not survive a refresh.' }
  }
}

const initialSavedDemoData = readSavedDemoData()

const MIN_GO_BAG_ITEMS = 7
const MAX_GO_BAG_ITEMS = 15
const currentYear = new Date().getFullYear()

type IconName =
  | 'droplet'
  | 'user'
  | 'users'
  | 'building'
  | 'pin'
  | 'shield'
  | 'wallet'
  | 'truck'
  | 'check'
  | 'cart'
  | 'card'

function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    droplet: <path d="M12 2.5C9.2 6.8 5.5 10.5 5.5 15a6.5 6.5 0 0 0 13 0c0-4.5-3.7-8.2-6.5-12.5Z" />,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21z" /></>,
    users: <><path d="M16 21v-1.5a5.5 5.5 0 0 0-11 0V21z" /><circle cx="10.5" cy="8" r="3" /><path d="M17 11a3 3 0 1 0-1-5.8M18 15a5 5 0 0 1 3 4.5V21h-3" /></>,
    building: <><path d="M4 21h16M6 21V5l6-2 6 2v16M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1" /><path d="M11 21v-3h2v3" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 8h16a2 2 0 0 1 2 2v3h-5a2 2 0 0 0 0 4h5M16 13h.01" /></>,
    truck: <><path d="M3 6h11v12H3zM14 10h4l3 4v4h-7z" /><circle cx="7.5" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    check: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    cart: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" /><circle cx="10" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></>,
    card: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(price)

const createDemoOrderId = () => `ASR-${Date.now().toString().slice(-8)}`
const formatDemoOrderDate = () =>
  new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date())

function AuthScreen({
  page,
  onNavigate,
  initialEmail,
  onLoginSuccess,
  onAdminLogin,
  onGuestContinue,
  databaseConfigured,
}: {
  page: 'login' | 'signup'
  onNavigate: (nextPage: AuthPage, email?: string) => void
  initialEmail: string
  onLoginSuccess: (email: string, firstName: string, userId?: string) => void
  onAdminLogin: (email: string, firstName?: string, userId?: string) => void
  onGuestContinue: () => void
  databaseConfigured: boolean
}) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [passwordClicked, setPasswordClicked] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const isSignup = page === 'signup'
  const showPasswordRequirements = passwordClicked || password.length > 0
  const passwordRequirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least 1 uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least 1 lowercase letter', met: /[a-z]/.test(password) },
    { label: 'At least 1 number', met: /\d/.test(password) },
    { label: 'At least 1 special character', met: /[^A-Za-z0-9]/.test(password) },
    { label: 'Passwords match', met: password.length > 0 && password === confirmPassword },
  ]
  const passwordIsValid = passwordRequirements.every((requirement) => requirement.met)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSignup && !passwordIsValid) {
      setFormMessage('Please meet each password requirement.')
      return
    }
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (supabase) {
        if (isSignup) {
          const { data, error } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                username: username.trim(),
              },
            },
          })
          if (error) throw error
          if (!data.session || !data.user) {
            setFormMessage('Account created. Check your email to confirm it, then sign in.')
            return
          }
          onLoginSuccess(normalizedEmail, firstName.trim(), data.user.id)
          return
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (error) throw error
        if (!data.user) throw new Error('Supabase did not return a signed-in user.')
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, role')
          .eq('id', data.user.id)
          .single()
        if (profileError) throw profileError
        if (profile.role === 'admin') {
          onAdminLogin(normalizedEmail, profile.first_name, data.user.id)
        } else {
          onLoginSuccess(normalizedEmail, profile.first_name, data.user.id)
        }
        return
      }

      if (isSignup) {
        const accounts = readLocalAccounts()
        if (accounts.some((account) => account.email.toLowerCase() === normalizedEmail)) {
          setFormMessage('An account with this email already exists. Sign in with your password instead.')
          return
        }
        const salt = window.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
        const passwordHash = await hashPassword(password, salt)
        accounts.push({
          email: normalizedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          username: username.trim(),
          passwordSalt: bytesToHex(salt),
          passwordHash,
        })
        window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts))
        onLoginSuccess(normalizedEmail, firstName.trim())
        return
      }

      const accounts = readLocalAccounts()
      const account = accounts.find((savedAccount) => savedAccount.email.toLowerCase() === normalizedEmail)
      if (!account) {
        setFormMessage('No account was found for this email. Create an account first.')
        return
      }
      const passwordHash = await hashPassword(password, hexToBytes(account.passwordSalt))
      if (passwordHash !== account.passwordHash) {
        setFormMessage('The email or password is incorrect.')
        return
      }
      onLoginSuccess(account.email, account.firstName)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'An unknown error occurred.'
      setFormMessage(`Unable to ${isSignup ? 'create your account' : 'sign in'}: ${detail}`)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <a className="auth-brand" href="/login" onClick={(event) => {
          event.preventDefault()
          onNavigate('login')
        }}>
          <img className="auth-logo" src={aquaLogo} alt="" />
          <span>Aqua<span>Shield</span><small>RELIEF CO.</small></span>
        </a>

        <div className="auth-intro-copy">
            <h1>Preparedness, saved.<br />Orders, tracked.</h1>
          <p>Sign in to save Go-Bags, reuse addresses, review orders and follow every delivery step.</p>
        </div>

        <ul className="auth-benefits">
          {[
            'Save custom Go-Bags',
            'Track active orders',
            'Reuse delivery addresses',
            'View purchase history',
          ].map((benefit) => (
            <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>
          ))}
        </ul>
      </section>

      <section className="auth-content">
        <div className={isSignup ? 'auth-card signup-card' : 'auth-card'}>
          <div className="auth-card-heading">
            <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p>
              {isSignup
                ? 'Save Go-Bags, addresses and order history in one place.'
                : 'Sign in to your AquaShield account.'}
            </p>
          </div>


          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <>
                <div className="auth-field-row">
                  <label className="auth-field">
                    <span>First Name</span>
                    <input
                      autoComplete="given-name"
                      required
                      maxLength={20}
                      title="Use letters only, up to 20 characters."
                      value={firstName}
                      onChange={(event) => setFirstName(sanitizeName(event.target.value))}
                    />
                  </label>
                  <label className="auth-field">
                    <span>Last Name</span>
                    <input
                      autoComplete="family-name"
                      required
                      maxLength={20}
                      title="Use letters only, up to 20 characters."
                      value={lastName}
                      onChange={(event) => setLastName(sanitizeName(event.target.value))}
                    />
                  </label>
                </div>
                <label className="auth-field">
                  <span>Username</span>
                  <input
                    autoComplete="username"
                    minLength={3}
                    maxLength={20}
                    pattern="[A-Za-z0-9_]+"
                    title="Use 3 to 20 letters, numbers, or underscores."
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
              </>
            )}

            <label className="auth-field">
              <span>{isSignup ? 'Email' : 'EMAIL'}</span>
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setFormMessage('')
                }}
              />
            </label>

            {isSignup && (
              <label className="auth-field">
                <span>Password</span>
                <span className="auth-password-control">
                  <input
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    className={password.length > 0 && !passwordIsValid ? 'auth-input-invalid' : ''}
                    value={password}
                    onClick={() => setPasswordClicked(true)}
                    onBlur={() => {
                      if (password.length === 0) setPasswordClicked(false)
                    }}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            )}

            {!isSignup && (
              <label className="auth-field">
                <span>Password</span>
                <span className="auth-password-control">
                  <input
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            )}

            {isSignup && (
              <div
                className={`password-requirements-panel${showPasswordRequirements ? ' is-open' : ''}`}
                aria-hidden={!showPasswordRequirements}
                inert={!showPasswordRequirements}
              >
                <div className="password-requirements" aria-live="polite">
                  <span className="requirements-title">Password requirements</span>
                  <ul>
                    {passwordRequirements.map((requirement) => (
                      <li className={requirement.met ? 'requirement-met' : ''} key={requirement.label}>
                        <span aria-hidden="true">{requirement.met ? '✓' : '•'}</span>
                        {requirement.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {isSignup && (
              <label className="auth-field">
                <span>Confirm Password</span>
                <span className="auth-password-control">
                  <input
                    autoComplete="new-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    className={confirmPassword.length > 0 && password !== confirmPassword ? 'auth-input-invalid' : ''}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    aria-pressed={showConfirmPassword}
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            )}

            {!isSignup && (
              <button
                className="auth-forgot"
                type="button"
                onClick={() => onNavigate('forgot-password', email)}
              >
                Forgot password?
              </button>
            )}

            <button className="auth-submit" type="submit">
              {isSignup ? 'Create Account' : 'Sign in'}
            </button>

            {!isSignup && (
              <>
                {!databaseConfigured && <button className="auth-guest" type="button" onClick={onGuestContinue}>
                  Continue as Guest
                </button>}
                <p className="auth-flow-note">Sign in securely with your email and password.</p>
              </>
            )}

            {formMessage && <p className="auth-form-message" role="status">{formMessage}</p>}
          </form>

          <div className="auth-switch">
            <span>{isSignup ? 'Already have an account?' : 'New to AquaShield?'}</span>
            <a
              href={isSignup ? '/login' : '/signup'}
              onClick={(event) => {
                event.preventDefault()
                onNavigate(isSignup ? 'login' : 'signup')
              }}
            >
              {isSignup ? 'Sign in' : 'Create an account'} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
        {isSignup && (
          <button className="auth-back" type="button" onClick={() => onNavigate('login')}>
            <span aria-hidden="true">←</span> Back to sign in
          </button>
        )}
      </section>
    </main>
  )
}

function AuthStatusScreen({
  status,
  email,
  onNavigate,
}: {
  status: 'register-success' | 'account-locked'
  email: string
  onNavigate: (nextPage: AuthPage, email?: string) => void
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(15 * 60)
  const [supportMessage, setSupportMessage] = useState('')
  const isSuccess = status === 'register-success'

  useEffect(() => {
    if (isSuccess || remainingSeconds === 0) return
    const timer = window.setInterval(() => {
      setRemainingSeconds((remaining) => Math.max(0, remaining - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isSuccess, remainingSeconds])

  const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0')
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0')

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <a className="auth-brand" href="/login" onClick={(event) => {
          event.preventDefault()
          onNavigate('login')
        }}>
          <img className="auth-logo" src={aquaLogo} alt="" />
          <span>Aqua<span>Shield</span><small>RELIEF CO.</small></span>
        </a>
        <div className="auth-intro-copy">
          <h1>Preparedness, saved.<br />Orders, tracked.</h1>
          <p>Sign in to save Go-Bags, reuse addresses, review orders and follow every delivery step.</p>
        </div>
        <ul className="auth-benefits">
          {['Save custom Go-Bags', 'Track active orders', 'Reuse delivery addresses', 'View purchase history'].map((benefit) => (
            <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>
          ))}
        </ul>
      </section>
      <section className="auth-content">
        <div className="auth-card auth-status-card">
          <span className={isSuccess ? 'auth-status-icon success' : 'auth-status-icon locked'} aria-hidden="true">
            {isSuccess ? '✓' : '!'}
          </span>
          <h2>{isSuccess ? 'Account Created' : 'Account temporarily locked'}</h2>
          <p>
            {isSuccess
              ? `Your account${email ? ` for ${email}` : ''} is ready. Sign in with the password you created.`
              : 'Too many unsuccessful sign-in attempts were detected. Try again later or reset your password.'}
          </p>
          {isSuccess ? (
            <button className="auth-status-primary" type="button" onClick={() => onNavigate('login', email)}>Sign in</button>
          ) : (
            <>
              <div className="auth-lock-countdown">
                <span>Try again in</span>
                <strong>{minutes}:{seconds}</strong>
              </div>
              <button className="auth-status-primary" type="button" onClick={() => onNavigate('forgot-password', email)}>Reset Password</button>
              <button className="auth-status-secondary" type="button" onClick={() => setSupportMessage('Support contact will be available when account services are connected.')}>Contact Support</button>
              {supportMessage && <small className="auth-status-disclaimer" role="status">{supportMessage}</small>}
            </>
          )}
        </div>
        <button className="auth-back" type="button" onClick={() => onNavigate('login', email)}>
          <span aria-hidden="true">←</span> Back to sign in
        </button>
      </section>
    </main>
  )
}

function AuthRecoveryScreen({
  email: initialEmail,
  onNavigate,
}: {
  email: string
  onNavigate: (nextPage: AuthPage, email?: string) => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setMessage('Password reset is unavailable because account services are not configured.')
      return
    }
    setIsSending(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setIsSending(false)
    setMessage(error
      ? `Could not send the reset link: ${error.message}`
      : 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.')
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <a className="auth-brand" href="/login" onClick={(event) => {
          event.preventDefault()
          onNavigate('login')
        }}>
          <img className="auth-logo" src={aquaLogo} alt="" />
          <span>Aqua<span>Shield</span><small>RELIEF CO.</small></span>
        </a>
        <div className="auth-intro-copy">
          <h1>Preparedness, saved.<br />Orders, tracked.</h1>
          <p>Sign in to save Go-Bags, reuse addresses, review orders and follow every delivery step.</p>
        </div>
        <ul className="auth-benefits">
          {['Save custom Go-Bags', 'Track active orders', 'Reuse delivery addresses', 'View purchase history'].map((benefit) => (
            <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>
          ))}
        </ul>
      </section>

      <section className="auth-content">
        <div className="auth-card auth-recovery-card">
          <div className="auth-card-heading">
            <h2>Reset your password</h2>
            <p>Enter the email address associated with your account and we’ll help you reset your password.</p>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <button className="auth-submit" type="submit" disabled={isSending}>{isSending ? 'Sending…' : 'Send Reset Link'}</button>
            <p className="auth-flow-note">Use the link in the email to choose a new password.</p>
            {message && <p className="auth-form-message" role="status">{message}</p>}
          </form>
          <div className="auth-switch auth-recovery-switch">
            <button type="button" onClick={() => onNavigate('login', email)}>← Back to sign in</button>
          </div>
        </div>
        <button className="auth-back" type="button" onClick={() => onNavigate('login', email)}>
          <span aria-hidden="true">←</span> Back to sign in
        </button>
      </section>
    </main>
  )
}

function AuthPasswordUpdateScreen({ onNavigate }: { onNavigate: (nextPage: AuthPage, email?: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) { setMessage('Password reset is unavailable because account services are not configured.'); return }
    if (password !== confirmPassword) { setMessage('The passwords do not match.'); return }
    setIsSaving(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setIsSaving(false)
    if (error) { setMessage(`Could not update the password: ${error.message}`); return }
    await supabase.auth.signOut()
    setPassword('')
    setConfirmPassword('')
    setMessage('Your password has been updated. You can now sign in with your new password.')
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <a className="auth-brand" href="/login" onClick={(event) => { event.preventDefault(); onNavigate('login') }}>
          <img className="auth-logo" src={aquaLogo} alt="" />
          <span>Aqua<span>Shield</span><small>RELIEF CO.</small></span>
        </a>
        <div className="auth-intro-copy"><h1>Choose a new password.</h1><p>Set a new password for your AquaShield account.</p></div>
      </section>
      <section className="auth-content">
        <div className="auth-card auth-recovery-card">
          <div className="auth-card-heading"><h2>Set new password</h2><p>Choose a password you have not used elsewhere.</p></div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="auth-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            <button className="auth-submit" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Update Password'}</button>
            {message && <p className="auth-form-message" role="status">{message}</p>}
          </form>
          <div className="auth-switch auth-recovery-switch"><button type="button" onClick={() => onNavigate('login')}>← Back to sign in</button></div>
        </div>
      </section>
    </main>
  )
}

function SoloGoBagBuilder({
  products: catalog,
  selectedItems,
  subtotal,
  discount,
  total,
  selectionMessage,
  onToggleItem,
  onAddBundle,
}: {
  products: Product[]
  selectedItems: number[]
  subtotal: number
  discount: number
  total: number
  selectionMessage: string
  onToggleItem: (productId: number) => void
  onAddBundle: () => void
}) {
  const eligibleProducts = catalog.filter((product) => product.id !== 9 && product.id !== 10)

  return (
    <section className="bundle-builder" id="builder" aria-labelledby="solo-gobag-heading">
      <div className="bundle-builder-main">
        <div className="gobag-promo-banner">
          <Icon name="check" />
          <span>Free Go-Bag backpack included with your custom kit order!</span>
        </div>
        <div className="builder-intro">
          <span className="prepared-eyebrow">Step-by-step survival gear</span>
          <h2 id="solo-gobag-heading">Build your own Go-Bag</h2>
          <p>Select between 7 and 15 emergency items for your custom kit. The 10L waterproof bag is included free.</p>
          <p className="gobag-selection-count" aria-live="polite">{selectedItems.length} of {MAX_GO_BAG_ITEMS} items selected · choose at least {MIN_GO_BAG_ITEMS}</p>
        </div>
        <div className="bundle-items">
          {eligibleProducts.map((product, index) => {
            const selected = selectedItems.includes(product.id)
            const cannotRemove = selected && selectedItems.length <= MIN_GO_BAG_ITEMS
            const atMaximum = !selected && selectedItems.length >= MAX_GO_BAG_ITEMS
            return (
              <article className={`bundle-item${selected ? ' selected' : ''}`} key={product.id}>
                <span className="bundle-number">{index + 1}</span>
                <ProductArtwork productId={product.id} productName={product.name} image={product.image} className="bundle-item-artwork" />
                <div className="bundle-item-info">
                  <span className="bundle-category">{product.category}</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                </div>
                <strong className="bundle-item-price">{formatPrice(product.price)}</strong>
                <button
                  className={selected ? 'selection-button is-selected' : 'selection-button'}
                  type="button"
                  aria-pressed={selected}
                  disabled={cannotRemove || atMaximum}
                  onClick={() => onToggleItem(product.id)}
                >
                  <span aria-hidden="true">{selected ? '✓' : '○'}</span>
                  {selected ? 'Selected' : 'Select'}
                </button>
              </article>
            )
          })}
        </div>
        {selectionMessage && <p className="gobag-selection-message" role="status">{selectionMessage}</p>}
      </div>

      <aside className="bundle-summary">
        <h2>Go-Bag bundle summary</h2>
        <ul>
          {eligibleProducts.filter((product) => selectedItems.includes(product.id)).map((product) => (
            <li key={product.id}><span>{product.name}</span><strong>{formatPrice(product.price)}</strong></li>
          ))}
          <li><span>10L Waterproof Dry Bag (Base)</span><strong>FREE</strong></li>
        </ul>
        <div className="summary-divider" />
        <div className="summary-subtotal"><span>Selected items ({selectedItems.length})</span><span>{formatPrice(subtotal)}</span></div>
        <div className="summary-discount"><span>Relief Bundle Discount</span><span>−{formatPrice(discount)}</span></div>
        <div className="summary-total"><span>Total estimate</span><strong>{formatPrice(total)}</strong></div>
        <button className="bundle-add-button" type="button" disabled={selectedItems.length < MIN_GO_BAG_ITEMS || selectedItems.length > MAX_GO_BAG_ITEMS} onClick={onAddBundle}>
          <Icon name="cart" /> Add to Cart
        </button>
        <p className="bundle-footnote">*Includes heavy-duty 10L emergency dry bag base unit.</p>
      </aside>
    </section>
  )
}

type AvailabilityFilter = 'in-stock' | 'low-stock' | null

function ShopFilterControls({
  variant,
  availabilityFilter,
  priceFilter,
  isFiltersOpen,
  onAvailabilityChange,
  onPriceChange,
  onToggle,
  onClear,
}: {
  variant: 'sidebar' | 'mobile'
  availabilityFilter: AvailabilityFilter
  priceFilter: string | null
  isFiltersOpen: boolean
  onAvailabilityChange: (value: AvailabilityFilter) => void
  onPriceChange: (value: string | null) => void
  onToggle: () => void
  onClear: () => void
}) {
  return (
    <aside className={`shop-filters ${variant === 'sidebar' ? 'sidebar-shop-filters' : 'shop-filters-mobile'}`} aria-label="Product filters">
      <div className="shop-filter-heading">
        <button className="shop-filter-toggle" type="button" aria-expanded={isFiltersOpen} aria-controls={`shop-filter-options-${variant}`} onClick={onToggle}>
          <strong>Filters</strong><span aria-hidden="true">{isFiltersOpen ? '−' : '+'}</span>
        </button>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      {isFiltersOpen && <div id={`shop-filter-options-${variant}`}>
        <fieldset>
          <legend>Availability</legend>
          {[
            { label: 'In Stock', value: 'in-stock' as const },
            { label: 'Low Stock', value: 'low-stock' as const },
          ].map((filter) => (
            <label key={filter.value}><input type="checkbox" checked={availabilityFilter === filter.value} onChange={() => onAvailabilityChange(availabilityFilter === filter.value ? null : filter.value)} /> {filter.label}</label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Price</legend>
          {['Under ₱500', '₱500–₱1,000', '₱1,000+'].map((filter) => (
            <label key={filter}><input type="checkbox" checked={priceFilter === filter} onChange={() => onPriceChange(priceFilter === filter ? null : filter)} /> {filter}</label>
          ))}
        </fieldset>
      </div>}
    </aside>
  )
}

function ShopPage({
  products: shopProducts,
  searchQuery,
  audienceType,
  selectedCategory,
  availabilityFilter,
  priceFilter,
  isFiltersOpen,
  currentPage,
  onAvailabilityChange,
  onPriceChange,
  onToggleFilters,
  onClearFilters,
  onPageChange,
  selectedBundleItems,
  bundleSubtotal,
  bundleDiscount,
  bundleTotal,
  bundleSelectionMessage,
  onAddToCart,
  onOpenProduct,
  onToggleBundleItem,
  onAddCompleteBundle,
  cartMessage,
}: {
  products: Product[]
  searchQuery: string
  audienceType: AudienceType
  selectedCategory: CategoryFilter
  availabilityFilter: AvailabilityFilter
  priceFilter: string | null
  isFiltersOpen: boolean
  currentPage: number
  onAvailabilityChange: (value: AvailabilityFilter) => void
  onPriceChange: (value: string | null) => void
  onToggleFilters: () => void
  onClearFilters: () => void
  onPageChange: (page: number) => void
  selectedBundleItems: number[]
  bundleSubtotal: number
  bundleDiscount: number
  bundleTotal: number
  bundleSelectionMessage: string
  onAddToCart: (product: Product) => void
  onOpenProduct: (product: Product) => void
  onToggleBundleItem: (productId: number) => void
  onAddCompleteBundle: () => void
  cartMessage: string
}) {
  const [sortOrder, setSortOrder] = useState('recommended')

  const filteredProducts = shopProducts
    .filter((product) => {
      const query = searchQuery.trim().toLowerCase()
      return query.length === 0 || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query)
    })
    .filter((product) => selectedCategory === 'All items' || product.category === selectedCategory)
    .filter((product) => availabilityFilter === null
      || (availabilityFilter === 'low-stock' ? product.stock > 0 && product.stock <= 10 : product.stock > 10))
    .filter((product) => {
      if (priceFilter === null) return true
      if (priceFilter === 'Under ₱500') return product.price < 500
      if (priceFilter === '₱500–₱1,000') return product.price >= 500 && product.price <= 1000
      return product.price > 1000
    })
    .sort((first, second) => {
      if (sortOrder === 'price-low') return first.price - second.price
      if (sortOrder === 'price-high') return second.price - first.price
      return first.id - second.id
    })
  const productsPerPage = 8
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage))
  const safePage = Math.min(currentPage, pageCount)
  const paginatedProducts = filteredProducts.slice(
    (safePage - 1) * productsPerPage,
    safePage * productsPerPage,
  )

  function clearFilters() {
    onPageChange(1)
    onClearFilters()
  }

  return (
    <main className="shop-page" id="products">
      <div className="shop-breadcrumb"><a href="/">Home</a><span>/</span><span>Shop</span></div>
      <div className="shop-heading">
        <h1>Emergency Essentials</h1>
        <p>Browse verified preparedness supplies across safety, medical, water, shelter and power.</p>
      </div>

      {audienceType === 'solo' && (
        <SoloGoBagBuilder
          products={shopProducts}
          selectedItems={selectedBundleItems}
          subtotal={bundleSubtotal}
          discount={bundleDiscount}
          total={bundleTotal}
          selectionMessage={bundleSelectionMessage}
          onToggleItem={onToggleBundleItem}
          onAddBundle={onAddCompleteBundle}
        />
      )}

      <div className="shop-layout">
        <ShopFilterControls
          variant="mobile"
          availabilityFilter={availabilityFilter}
          priceFilter={priceFilter}
          isFiltersOpen={isFiltersOpen}
          onAvailabilityChange={onAvailabilityChange}
          onPriceChange={onPriceChange}
          onToggle={onToggleFilters}
          onClear={clearFilters}
        />

        <section className="shop-results" aria-label="Shop products">
          <div className="shop-results-toolbar">
            {availabilityFilter && <button className="shop-stock-chip" type="button" onClick={() => {
              onPageChange(1)
              onAvailabilityChange(null)
            }}>{availabilityFilter === 'in-stock' ? 'In Stock' : 'Low Stock'} <span aria-hidden="true">×</span></button>}
            <label className="shop-sort">Sort by
              <select value={sortOrder} onChange={(event) => {
                onPageChange(1)
                setSortOrder(event.target.value)
              }} aria-label="Sort products">
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
            </label>
          </div>
          {filteredProducts.length > 0 ? (
            <div className="shop-product-grid">
              {paginatedProducts.map((product) => (
                <article
                  className="shop-product-card"
                  key={product.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => onOpenProduct(product)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      onOpenProduct(product)
                    }
                  }}
                >
                  <div className="shop-product-image">
                    <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
                    {product.stock <= 10 && <span className={`shop-stock-badge${product.stock === 0 ? ' unavailable' : ''}`}>{stockAvailabilityLabel(product.stock)}</span>}
                  </div>
                  <div className="shop-product-info">
                    <div className="shop-product-meta"><span>{product.category}</span></div>
                    <h2>{product.name}</h2>
                    <div className="shop-product-buy"><strong>{formatPrice(product.price)}</strong><button type="button" onClick={(event) => {
                      event.stopPropagation()
                      onAddToCart(product)
                    }} aria-label={`Add ${product.name} to cart`} title="Add to cart"><Icon name="cart" /></button></div>
                    {audienceType === 'organization' && <div className="shop-organization-prices">Organization rates: 20+ {formatPrice(Math.round(product.price * 0.95))} · 50+ {formatPrice(Math.round(product.price * 0.9))} · 100+ {formatPrice(Math.round(product.price * 0.85))}</div>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="shop-empty"><p>No products match these filters.</p><button type="button" onClick={clearFilters}>Clear filters</button></div>
          )}
          {filteredProducts.length > 0 && (
            <nav className="shop-pagination" aria-label="Product pages">
              <span className="shop-page-count">
                Showing {(safePage - 1) * productsPerPage + 1}–{Math.min(safePage * productsPerPage, filteredProducts.length)} of {filteredProducts.length}
              </span>
              <div className="shop-page-buttons">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={safePage === 1}
                  onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                >
                  ‹
                </button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                  <button
                    type="button"
                    key={page}
                    aria-label={`Page ${page}`}
                    aria-current={safePage === page ? 'page' : undefined}
                    className={safePage === page ? 'active' : ''}
                    onClick={() => onPageChange(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={safePage === pageCount}
                  onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
                >
                  ›
                </button>
              </div>
            </nav>
          )}
          <p className="shop-cart-feedback" role="status" aria-live="polite">{cartMessage}</p>
        </section>
      </div>
      <p className="shop-search-context" aria-live="polite">{searchQuery ? `Search results for “${searchQuery}”` : ''}</p>
    </main>
  )
}

function SearchResultsPage({
  products: catalog,
  query,
  onQueryChange,
  onSearch,
  onSelectSuggestion,
  onBrowseAll,
  onAddToCart,
  onOpenProduct,
}: {
  products: Product[]
  query: string
  onQueryChange: (query: string) => void
  onSearch: (event: FormEvent<HTMLFormElement>) => void
  onSelectSuggestion: (suggestion: string) => void
  onBrowseAll: () => void
  onAddToCart: (product: Product) => void
  onOpenProduct: (product: Product) => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const results = catalog.filter((product) =>
    `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(normalizedQuery),
  )

  return (
    <main className="search-results-page">
      <h1>Search Results</h1>
      <form className="search-results-form" onSubmit={onSearch}>
        <input
          aria-label="Search products"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search emergency supplies..."
        />
        <button type="submit">Search</button>
      </form>
      {results.length === 0 ? (
        <section className="search-empty-state" aria-live="polite">
          <div className="search-empty-content">
            <span className="search-empty-icon" aria-hidden="true">?</span>
            <h2>We couldn’t find that item</h2>
            <p>Try a broader term like “water”, “first aid”, “radio” or browse the preparedness categories.</p>
            <button type="button" onClick={onBrowseAll}>Browse All Products</button>
          </div>
        </section>
      ) : (
      <>
      <p className="search-results-count">
        {results.length} {results.length === 1 ? 'result' : 'results'} for “{query.trim()}”
      </p>
      <div className="search-suggestions" aria-label="Popular searches">
        {['Water', 'Emergency', 'Go-Bag'].map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelectSuggestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="search-result-grid">
          {results.map((product) => (
            <article
              className="shop-product-card"
              key={product.id}
              role="link"
              tabIndex={0}
              onClick={() => onOpenProduct(product)}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onOpenProduct(product)
                }
              }}
            >
              <div className="shop-product-image">
                <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
                {product.stock <= 10 && <span className={`shop-stock-badge${product.stock === 0 ? ' unavailable' : ''}`}>{stockAvailabilityLabel(product.stock)}</span>}
              </div>
              <div className="shop-product-info">
                <div className="shop-product-meta"><span>{product.category}</span></div>
                <h2>{product.name}</h2>
                <div className="shop-product-buy"><strong>{formatPrice(product.price)}</strong><button type="button" onClick={(event) => {
                  event.stopPropagation()
                  onAddToCart(product)
                }} aria-label={`Add ${product.name} to cart`} title="Add to cart"><Icon name="cart" /></button></div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {normalizedQuery.includes('water') && results.length > 0 && (
        <aside className="search-guide">
          <div>
            <span>Preparedness guide</span>
            <h2>Emergency Water Planning</h2>
            <p>Learn how to prepare safe water for your household before a flood or typhoon.</p>
          </div>
          <a href="/#builder">Build a Go-Bag</a>
        </aside>
      )}
      </>
      )}
    </main>
  )
}

function CustomerReviewsPage({
  product,
  reviews,
  onWriteReview,
}: {
  product: Product
  reviews: CustomerReview[]
  onWriteReview: () => void
}) {
  const totalReviews = reviews.length
  const averageRating = totalReviews ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews : 0
  const ratingRows = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((review) => review.rating === stars).length }))

  return (
    <main className="customer-reviews-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><a href="/shop">Shop</a><span>/</span>
        <a href={`/product/${product.id}`}>{product.category}</a><span>/</span><span>{product.name}</span>
      </nav>
      <h1>Customer Reviews</h1>
      <p className="customer-reviews-product">{product.name}</p>

      <section className="review-summary" aria-label="Customer rating summary">
        <div className="review-summary-score">
          <strong>{totalReviews ? averageRating.toFixed(1) : '—'}</strong>
          <span aria-label={totalReviews ? `${averageRating.toFixed(1)} out of 5 stars` : 'No ratings yet'}>{totalReviews ? '★'.repeat(Math.round(averageRating)) : '☆☆☆☆☆'}</span>
          <small>{totalReviews} verified {totalReviews === 1 ? 'review' : 'reviews'}</small>
        </div>
        <div className="review-rating-breakdown">
          {ratingRows.map((row) => (
            <div className="review-rating-row" key={row.stars}>
              <span>{row.stars} stars</span>
              <div className="review-rating-track"><span style={{ width: `${totalReviews ? (row.count / totalReviews) * 100 : 0}%` }} /></div>
              <small>{row.count}</small>
            </div>
          ))}
        </div>
        <button className="review-write-button" type="button" onClick={onWriteReview}>Write a Review</button>
      </section>

      <section className="customer-review-list" aria-label="Reviews">
        {reviews.length === 0 && <p>No verified reviews yet. Be the first to review after your order is delivered.</p>}
        {reviews.map((review, index) => (
          <article className="customer-review-card" key={`${review.name}-${review.date}-${index}`}>
            <div className="customer-review-author">
              <strong>{review.name}</strong>
              <span aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
            </div>
            <div className="customer-review-body">
              <div><h2>{review.title}</h2><p>{review.text}</p></div>
              {review.recommended && <small className="review-recommendation">Recommends this product</small>}
            </div>
            <time>{review.date}</time>
          </article>
        ))}
      </section>
    </main>
  )
}

function WriteReviewPage({
  product,
  canReview,
  onSubmitReview,
}: {
  product: Product
  canReview: boolean
  onSubmitReview: (review: Omit<CustomerReview, 'name' | 'date'>) => Promise<void>
}) {
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [recommended, setRecommended] = useState(true)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canReview) { setMessage('A verified review is available after this product is marked delivered on one of your orders.'); return }
    setSubmitting(true)
    setMessage('')
    void onSubmitReview({ rating, title: title.trim(), text: text.trim(), recommended })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not submit your review.'))
      .finally(() => setSubmitting(false))
  }

  return (
    <main className="write-review-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><a href="/shop">Shop</a><span>/</span>
        <a href={`/product/${product.id}/reviews`}>Customer Reviews</a><span>/</span><span>Write a Review</span>
      </nav>
      <h1>Customer Reviews</h1>
      <p className="customer-reviews-product">{product.name}</p>
      {!canReview && <p role="status">You can review this product after it is marked delivered on one of your orders.</p>}
      {message && <p role="alert">{message}</p>}
      <form className="write-review-form" onSubmit={submitReview}>
        <label className="review-field-label">Your Rating</label>
        <div className="review-star-picker" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
              className={value <= rating ? 'selected' : ''}
              key={value}
              onClick={() => setRating(value)}
            >
              ★
            </button>
          ))}
        </div>
        <label className="review-field-label" htmlFor="review-title">Review Title</label>
        <input
          id="review-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Summarize your experience"
          minLength={3}
          maxLength={120}
          required
        />
        <label className="review-field-label" htmlFor="review-text">Your Review</label>
        <textarea
          id="review-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Share what worked well, how you used the product, and what other preparedness buyers should know."
          minLength={10}
          maxLength={2000}
          required
        />
        <label className="review-recommend-toggle">
          <input type="checkbox" checked={recommended} onChange={(event) => setRecommended(event.target.checked)} />
          <span>I would recommend this product</span>
        </label>
        <div className="write-review-submit">
          <button type="submit" disabled={submitting || !canReview}>{submitting ? 'Submitting…' : 'Submit Review'}</button>
        </div>
      </form>
    </main>
  )
}

function ProductDetailPage({
  product,
  catalog,
  reviews,
  quantity,
  onQuantityChange,
  onAddToCart,
  onAddToGoBag,
  onOpenProduct,
  onOpenReviews,
}: {
  product: Product
  catalog: Product[]
  reviews: CustomerReview[]
  quantity: number
  onQuantityChange: (quantity: number) => void
  onAddToCart: (product: Product, quantity: number) => void
  onAddToGoBag: (product: Product) => void
  onOpenProduct: (product: Product) => void
  onOpenReviews: () => void
}) {
  const [activeTab, setActiveTab] = useState('Overview')
  const tabs = ['Overview', 'Specifications', 'Preparedness Notes', 'Delivery & Returns']
  const details: Record<string, { heading: string; description: string; facts: [string, string][] }> = {
    Overview: {
      heading: `Built for ${product.category === 'Water Purification' ? 'emergency water access' : 'emergency preparedness'}.`,
      description: product.description,
      facts: [
        ['Usage', product.category],
        ['Format', product.name],
        ['Go-Bag', product.category === 'Barangay Bundles' ? 'Complete kit' : 'Recommended'],
      ],
    },
    Specifications: {
      heading: 'Product specifications',
      description: 'Designed for practical use in emergency kits and disaster response.',
      facts: [
        ['Category', product.category],
        ['Product', product.name],
        ['Price', formatPrice(product.price)],
      ],
    },
    'Preparedness Notes': {
      heading: 'Preparedness notes',
      description: 'Store this item with your household emergency supplies and check it regularly.',
      facts: [
        ['Recommended use', 'Go-Bag essential'],
        ['Readiness', 'Keep accessible'],
        ['Planning', 'Include in household emergency plan'],
      ],
    },
    'Delivery & Returns': {
      heading: 'Delivery & returns',
      description: 'Nationwide delivery is available. Orders are prepared for dispatch from Manila.',
      facts: [
        ['Delivery', 'Nationwide'],
        ['Dispatch', 'Ready to dispatch'],
        ['Support', 'Contact AquaShield for order assistance'],
      ],
    },
  }
  const detail = details[activeTab]

  return (
    <main className="product-detail-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><a href="/shop">Shop</a><span>/</span>
        <span>{product.category}</span><span>/</span><span>{product.name}</span>
      </nav>
      <section className="product-detail-main">
        <div className="product-detail-artwork">
          <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
        </div>
        <div className="product-detail-copy">
          <span className="product-detail-badge">{product.badge ?? 'Kit Essential'}</span>
          <span className="product-detail-category">{product.category}</span>
          <h1>{product.name}</h1>
          <button className="product-detail-rating" type="button" onClick={onOpenReviews}>
            <span aria-hidden="true">{reviews.length ? '★'.repeat(Math.round(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length)) : '☆☆☆☆☆'}</span> {reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : 'No ratings'} <i>·</i> {reviews.length} reviews
          </button>
          <strong className="product-detail-price">{formatPrice(product.price)}</strong>
          <p className="product-stock-status"><span aria-hidden="true" /> In stock — ready to dispatch</p>
          <p className="product-detail-description">{product.description} Portable and practical for Go-Bags, flood evacuation and emergency household planning.</p>
          <label className="product-quantity-label" htmlFor="product-quantity">Quantity</label>
          <div className="product-quantity" id="product-quantity">
            <button type="button" aria-label="Decrease quantity" onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>−</button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" aria-label="Increase quantity" onClick={() => onQuantityChange(quantity + 1)}>+</button>
          </div>
          <div className="product-detail-actions">
            <button className="product-add-cart" type="button" aria-label={`Add ${product.name} to cart`} title="Add to cart" onClick={() => onAddToCart(product, quantity)}><Icon name="cart" /></button>
            <button className="product-add-bag" type="button" onClick={() => onAddToGoBag(product)}>Add to Go-Bag</button>
          </div>
          <ul className="product-detail-promises">
            <li>Water-ready essential</li>
            <li>Nationwide delivery</li>
            <li>Real-time inventory</li>
          </ul>
        </div>
      </section>
      <section className="product-detail-info" aria-label="Product information">
        <div className="product-detail-tabs" role="tablist" aria-label="Product details">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              key={tab}
              id={`product-tab-${tab.replaceAll(' ', '-').toLowerCase()}`}
              aria-selected={activeTab === tab}
              aria-controls="product-tab-panel"
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="product-detail-tab-panel" id="product-tab-panel" role="tabpanel" aria-labelledby={`product-tab-${activeTab.replaceAll(' ', '-').toLowerCase()}`}>
          <div>
            <h2>{detail.heading}</h2>
            <p>{detail.description}</p>
          </div>
          <dl>
            {detail.facts.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
      </section>
      <section className="related-products" aria-label="Related products">
        <h2>You may also need</h2>
        <div>
          {catalog.filter((candidate) => candidate.id !== product.id).slice(0, 4).map((candidate) => (
            <button type="button" key={candidate.id} onClick={() => onOpenProduct(candidate)}>
              <ProductArtwork productId={candidate.id} productName={candidate.name} />
              <span>{candidate.name}</span>
              <strong>{formatPrice(candidate.price)}</strong>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

function CartDrawer({
  catalog,
  items,
  cart,
  subtotal,
  addedProduct,
  onClose,
  onViewCart,
  onAddProduct,
}: {
  catalog: Product[]
  items: Product[]
  cart: Record<number, number>
  subtotal: number
  addedProduct: Product | null
  onClose: () => void
  onViewCart: () => void
  onAddProduct: (product: Product) => void
}) {
  const recommendations = catalog.filter((product) => product.id !== addedProduct?.id).slice(0, 3)
  const tax = Math.round(subtotal * SALES_TAX_RATE)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="cart-drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Your cart">
        <header className="cart-drawer-header">
          <h2><Icon name="cart" /> Your Cart ({items.reduce((total, product) => total + (cart[product.id] ?? 0), 0)} items)</h2>
          <button type="button" aria-label="Close cart" onClick={onClose}>×</button>
        </header>
        <div className="cart-drawer-content">
          {addedProduct && (
            <>
              <h3 className="cart-added-heading">Item added successfully!</h3>
              <div className="cart-added-item">
                <ProductArtwork productId={addedProduct.id} productName={addedProduct.name} />
                <div>
                  <strong>{addedProduct.name}</strong>
                  <small>{addedProduct.category}</small>
                  <b>{formatPrice(addedProduct.price)}</b>
                </div>
                <small>Qty {cart[addedProduct.id] ?? 1}</small>
              </div>
            </>
          )}

          {items.length > 0 ? (
            <>
              <section className="cart-drawer-line-items" aria-label="Itemized cart">
                {items.map((product) => {
                  const quantity = cart[product.id] ?? 0
                  return (
                    <article key={product.id}>
                      <strong>{product.name}</strong>
                      <small>{product.description}</small>
                      <span>Unit price: {formatPrice(product.price)} · Qty: {quantity}</span>
                      <b>{formatPrice(product.price)} × {quantity} = {formatPrice(product.price * quantity)}</b>
                    </article>
                  )
                })}
              </section>
              <div className="cart-drawer-subtotal">
                <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
                <div><span>Estimated VAT (12%)</span><strong>{formatPrice(tax)}</strong></div>
                <div><span>Shipping</span><strong>Calculated at checkout</strong></div>
                <div className="cart-drawer-total"><span>Estimated total</span><strong>{formatPrice(subtotal + tax)}</strong></div>
                <small>{items.reduce((total, product) => total + (cart[product.id] ?? 0), 0)} items currently in cart</small>
                <small>Real-time stock rechecked at checkout</small>
              </div>
              <button className="cart-drawer-view" type="button" onClick={onViewCart}>View Cart</button>
            </>
          ) : (
            <p className="cart-drawer-empty">Your cart is empty.</p>
          )}
          <button className="cart-drawer-continue" type="button" onClick={onClose}>Continue Shopping</button>

          <section className="cart-drawer-recommendations">
            <h3>You may also need</h3>
            {recommendations.map((product) => (
              <article key={product.id}>
                <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
                <div><strong>{product.name}</strong><small>{formatPrice(product.price)}</small></div>
                <button type="button" aria-label={`Add ${product.name} to cart`} title="Add to cart" onClick={() => onAddProduct(product)}><Icon name="cart" /></button>
              </article>
            ))}
          </section>
        </div>
      </aside>
    </div>
  )
}

function CartPage({
  items,
  cart,
  subtotal,
  onUpdateQuantity,
  onRequestRemove,
  onProceedToCheckout,
  onContinueShopping,
}: {
  items: Product[]
  cart: Record<number, number>
  subtotal: number
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRequestRemove: (product: Product) => void
  onProceedToCheckout: () => void
  onContinueShopping: () => void
}) {
  const itemCount = items.reduce((total, product) => total + (cart[product.id] ?? 0), 0)
  const tax = Math.round(subtotal * SALES_TAX_RATE)

  return (
    <main className="full-cart-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><span>Your Cart</span>
      </nav>
      <header className="full-cart-heading">
        <div><span className="prepared-eyebrow">AquaShield shopping bag</span><h1>Your Cart</h1></div>
        <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
      </header>
      {items.length > 0 ? (
        <div className="full-cart-layout">
          <section className="full-cart-items" aria-label="Cart items">
            {items.map((product) => (
              <article className="full-cart-item" key={product.id}>
                <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
                <div className="full-cart-item-info">
                  <span>{product.category}</span>
                  <h2>{product.name}</h2>
                  <p>{product.description}</p>
                  <small>{formatPrice(product.price)} × {cart[product.id]} = {formatPrice(product.price * (cart[product.id] ?? 0))}</small>
                  <button type="button" onClick={() => onRequestRemove(product)}>Remove</button>
                </div>
                <div className="full-cart-item-controls">
                  <strong>{formatPrice(product.price)}</strong>
                  <div className="quantity-control" aria-label={`${product.name} quantity`}>
                    <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => onUpdateQuantity(product.id, (cart[product.id] ?? 1) - 1)}>−</button>
                    <span>{cart[product.id]}</span>
                    <button type="button" aria-label={`Add one ${product.name}`} onClick={() => onUpdateQuantity(product.id, (cart[product.id] ?? 0) + 1)}>+</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
          <aside className="full-cart-summary">
            <h2>Order Summary</h2>
            <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
            <div><span>VAT (12%)</span><strong>{formatPrice(tax)}</strong></div>
            <div><span>Delivery</span><span>Calculated at checkout</span></div>
            <div className="full-cart-total"><span>Total before delivery</span><strong>{formatPrice(subtotal + tax)}</strong></div>
            <button type="button" onClick={onProceedToCheckout}>Proceed to Checkout</button>
            <button className="full-cart-continue" type="button" onClick={onContinueShopping}>Continue Shopping</button>
          </aside>
        </div>
      ) : (
        <section className="full-cart-empty">
          <span className="cart-empty-icon"><Icon name="cart" /></span>
          <h2>Your cart is empty</h2>
          <p>Find the essentials you need to keep your household prepared.</p>
          <button type="button" onClick={onContinueShopping}>Browse All Products</button>
        </section>
      )}
    </main>
  )
}

function StockCheckPage({
  items,
  cart,
  onReturnToCart,
  onContinue,
}: {
  items: Product[]
  cart: Record<number, number>
  onReturnToCart: () => void
  onContinue: () => void
}) {
  if (items.length === 0) {
    return (
      <main className="stock-check-page">
        <section className="stock-check-card stock-check-empty">
          <span className="prepared-eyebrow">Final stock check</span>
          <h1>Your cart is empty</h1>
          <p>Add items to your cart before checking availability.</p>
          <button type="button" onClick={onReturnToCart}>Return to Cart</button>
        </section>
      </main>
    )
  }

  return (
    <main className="stock-check-page">
      <section className="stock-check-card">
        <span className="prepared-eyebrow">Final stock check</span>
        <h1>Checking item availability</h1>
        <p className="stock-check-description">
          Before your order is placed, AquaShield rechecks stock and quantities.
        </p>
        <ul className="stock-check-list" aria-label="Item availability">
          {items.map((product) => {
            const status = product.stock === 0 ? 'out-of-stock' : product.stock <= 10 ? 'low-stock' : 'available'
            return (
              <li className="stock-check-row" key={product.id}>
                <strong>{product.name}</strong>
                <span>Qty {cart[product.id]}</span>
                <span className={`stock-check-status ${status}`}>
                  {status === 'out-of-stock' ? 'Out of stock' : status === 'low-stock' ? 'Low stock' : 'Available'}
                </span>
              </li>
            )
          })}
        </ul>
        <button
          className="stock-check-continue"
          type="button"
          onClick={onContinue}
        >
          Continue
        </button>
      </section>
    </main>
  )
}

type CheckoutStep =
  | 'contact'
  | 'address'
  | 'shipping'
  | 'payment'
  | 'review'
  | 'processing'
  | 'success'

const initialCheckoutStep = (): CheckoutStep => {
  const step = window.location.pathname.split('/')[2]
  const validSteps: CheckoutStep[] = ['contact', 'address', 'shipping', 'payment', 'review', 'processing', 'success']
  return validSteps.find((validStep) => validStep === step) ?? 'contact'
}

type DeliveryMethod = 'Standard Nationwide' | 'Priority Dispatch' | 'Barangay / Hub Pickup'
type PaymentMethod = 'GCash' | 'Maya' | 'Cash on Delivery'

const deliveryOptions: { name: DeliveryMethod; timing: string }[] = [
  { name: 'Standard Nationwide', timing: '3–5 business days' },
  { name: 'Priority Dispatch', timing: '1–2 business days' },
  { name: 'Barangay / Hub Pickup', timing: 'Pickup when ready' },
]

function standardShippingFee(distanceKm: number | null) {
  if (distanceKm === null) return null
  if (distanceKm <= 25) return 99
  if (distanceKm <= 50) return 149
  if (distanceKm <= 100) return 219
  if (distanceKm <= 250) return 349
  if (distanceKm <= 500) return 499
  if (distanceKm <= 1000) return 699
  return 899
}

function shippingFee(method: DeliveryMethod, distanceKm: number | null) {
  if (method === 'Barangay / Hub Pickup') return 0
  const standard = standardShippingFee(distanceKm)
  return standard === null ? null : method === 'Priority Dispatch' ? standard + 100 : standard
}

const provinceOptions = [
  { region: 'NCR', locations: ['NCR', 'Manila', 'Makati', 'Quezon City', 'Pasig', 'Taguig', 'Mandaluyong', 'Parañaque', 'Pasay', 'Caloocan', 'Marikina', 'Muntinlupa', 'Las Piñas', 'Valenzuela', 'San Juan', 'Malabon', 'Navotas', 'Pateros'] },
  { region: 'CAR', locations: ['Abra', 'Apayao', 'Benguet', 'Ifugao', 'Kalinga', 'Mountain Province'] },
  { region: 'Ilocos Region', locations: ['Ilocos Norte', 'Ilocos Sur', 'La Union', 'Pangasinan'] },
  { region: 'Cagayan Valley', locations: ['Batanes', 'Cagayan', 'Isabela', 'Nueva Vizcaya', 'Quirino'] },
  { region: 'Central Luzon', locations: ['Aurora', 'Bataan', 'Bulacan', 'Nueva Ecija', 'Pampanga', 'Tarlac', 'Zambales'] },
  { region: 'CALABARZON', locations: ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal'] },
  { region: 'MIMAROPA', locations: ['Marinduque', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan', 'Romblon'] },
  { region: 'Bicol Region', locations: ['Albay', 'Camarines Norte', 'Camarines Sur', 'Catanduanes', 'Masbate', 'Sorsogon'] },
  { region: 'Western Visayas', locations: ['Aklan', 'Antique', 'Capiz', 'Guimaras', 'Iloilo', 'Negros Occidental'] },
  { region: 'Central Visayas', locations: ['Bohol', 'Cebu', 'Negros Oriental', 'Siquijor'] },
  { region: 'Eastern Visayas', locations: ['Biliran', 'Eastern Samar', 'Leyte', 'Northern Samar', 'Samar', 'Southern Leyte'] },
  { region: 'Zamboanga Peninsula', locations: ['Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay'] },
  { region: 'Northern Mindanao', locations: ['Bukidnon', 'Camiguin', 'Lanao del Norte', 'Misamis Occidental', 'Misamis Oriental'] },
  { region: 'Davao Region', locations: ['Davao de Oro', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental', 'Davao Oriental'] },
  { region: 'SOCCSKSARGEN', locations: ['Cotabato', 'Sarangani', 'South Cotabato', 'Sultan Kudarat'] },
  { region: 'Caraga', locations: ['Agusan del Norte', 'Agusan del Sur', 'Dinagat Islands', 'Surigao del Norte', 'Surigao del Sur'] },
  { region: 'BARMM', locations: ['Basilan', 'Lanao del Sur', 'Maguindanao del Norte', 'Maguindanao del Sur', 'Tawi-Tawi'] },
]

const cityMunicipalityOptions = [
  'Angeles City', 'Antipolo City', 'Bacolod City', 'Bacoor City', 'Baguio City', 'Baliwag City',
  'Batangas City', 'Biñan City', 'Bislig City', 'Bogo City', 'Borongan City', 'Butuan City',
  'Cabanatuan City', 'Cagayan de Oro City', 'Calamba City', 'Calapan City', 'Caloocan City',
  'Candon City', 'Carmona City', 'Cauayan City', 'Cavite City', 'Cebu City', 'Cotabato City',
  'Dagupan City', 'Danao City', 'Davao City', 'Digos City', 'Dipolog City', 'Dumaguete City',
  'General Santos City', 'Gingoog City', 'Iligan City', 'Iloilo City', 'Iriga City', 'Isabela City',
  'Kabankalan City', 'Kidapawan City', 'Koronadal City', 'La Carlota City', 'Laoag City',
  'Lapu-Lapu City', 'Las Piñas City', 'Legazpi City', 'Ligao City', 'Lipa City', 'Lucena City',
  'Makati City', 'Malabon City', 'Malaybalay City', 'Malolos City', 'Mandaluyong City',
  'Mandaue City', 'Manila', 'Marawi City', 'Marikina City', 'Muntinlupa City', 'Naga City',
  'Navotas City', 'Olongapo City', 'Ormoc City', 'Oroquieta City', 'Ozamiz City',
  'Pagadian City', 'Palayan City', 'Panabo City', 'Parañaque City', 'Pasay City', 'Pasig City',
  'Puerto Princesa City', 'Quezon City', 'Roxas City', 'San Carlos City', 'San Fernando City',
  'San Jose del Monte City', 'San Juan City', 'San Pablo City', 'Santa Rosa City', 'Santiago City',
  'Silay City', 'Sipalay City', 'Surigao City', 'Tabaco City', 'Tacloban City', 'Tagaytay City',
  'Tagbilaran City', 'Taguig City', 'Talisay City', 'Tanauan City', 'Tandag City', 'Tangub City',
  'Tarlac City', 'Tayabas City', 'Toledo City', 'Trece Martires City', 'Tuguegarao City',
  'Urdaneta City', 'Valencia City', 'Valenzuela City', 'Vigan City', 'Zamboanga City',
]

function CheckoutPage({
  step,
  items,
  cart,
  subtotal,
  audienceType,
  onNavigate,
  onOrderComplete,
  onSimulatePayment,
  onViewOrders,
  onTrackOrder,
  onInvoice,
  savedAddresses,
}: {
  step: CheckoutStep
  items: Product[]
  cart: Record<number, number>
  subtotal: number
  audienceType: AudienceType
  onNavigate: (step: CheckoutStep) => void
  onOrderComplete: (order: OrderRecord) => Promise<OrderRecord> | OrderRecord
  onSimulatePayment: (order: OrderRecord, approved: boolean) => Promise<OrderRecord>
  onViewOrders: () => void
  onTrackOrder: () => void
  onInvoice: (orderId: string) => void
  savedAddresses: SavedAddress[]
}) {
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [barangay, setBarangay] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [saveUpdates, setSaveUpdates] = useState(true)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('Standard Nationwide')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('GCash')
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null)
  const [orderSubmitMessage, setOrderSubmitMessage] = useState('')
  const [paymentSimulationBusy, setPaymentSimulationBusy] = useState(false)
  const finishOrderRef = useRef<() => Promise<void>>(async () => {})

  const contactName = [contactFirstName, contactLastName].filter(Boolean).join(' ')
  const hasRequiredBulkOrder = audienceType === 'solo' || Boolean(cart[10])
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null)
  const updateRouteDistance = useCallback((distanceKm: number | null) => setRouteDistanceKm(distanceKm), [])
  const shipping = shippingFee(deliveryMethod, routeDistanceKm)
  const tax = Math.round(subtotal * SALES_TAX_RATE)
  const total = shipping === null ? null : subtotal + tax + shipping
  const fullAddress = [streetAddress, barangay && `Brgy. ${barangay}`, city, province, postalCode]
    .filter(Boolean)
    .join(', ')
  const activeStep = ['payment', 'processing'].includes(step)
    ? 'Payment'
    : ['review', 'success'].includes(step) ? 'Review' : 'Delivery'

  async function finishOrder() {
    if (shipping === null || total === null) {
      setOrderSubmitMessage('Wait for Google Maps to confirm a drivable route, or select Barangay / Hub Pickup.')
      onNavigate('shipping')
      return
    }
    const order: OrderRecord = {
      id: createDemoOrderId(),
      items: items.map((product) => ({ product, quantity: cart[product.id] ?? 0 })),
      subtotal,
      tax,
      shipping,
      total,
      contactName,
      email,
      phone,
      address: fullAddress,
      deliveryMethod,
      paymentMethod,
      status: paymentMethod === 'Cash on Delivery' ? 'Processing' : 'Awaiting payment',
      paymentStatus: paymentMethod === 'Cash on Delivery' ? 'pending' : 'pending',
      createdAt: formatDemoOrderDate(),
      deliveryAddress: {
        addressLine1: streetAddress,
        addressLine2: barangay ? `Brgy. ${barangay}` : '',
        city,
        province,
        postalCode,
      },
    }
    setOrderSubmitMessage('')
    try {
      const completed = await onOrderComplete(order)
      setCompletedOrder(completed)
      onNavigate('success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to place this order.'
      setOrderSubmitMessage(message)
      onNavigate('review')
    }
  }

  useEffect(() => {
    finishOrderRef.current = finishOrder
  })

  useEffect(() => {
    if (step !== 'processing') return
    const timer = window.setTimeout(() => { void finishOrderRef.current() }, 1800)
    return () => window.clearTimeout(timer)
  }, [step])

  function renderOrderSummary() {
    return (
      <aside className="checkout-order-summary">
        <h2>Order Summary</h2>
        <ul>
          {items.map((product) => {
            const quantity = cart[product.id] ?? 0
            return (
              <li key={product.id}>
                <span>{product.name}<small>{product.description}</small><small>Unit price: {formatPrice(product.price)} · Qty: {quantity}</small></span>
                <strong>{formatPrice(product.price)} × {quantity} = {formatPrice(product.price * quantity)}</strong>
              </li>
            )
          })}
        </ul>
        <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
        <div><span>VAT (12%)</span><strong>{formatPrice(tax)}</strong></div>
          <div><span>Shipping</span><strong>{shipping === null ? 'Waiting for route' : shipping === 0 ? 'FREE' : formatPrice(shipping)}</strong></div>
        <div className="checkout-summary-total"><span>Total</span><strong>{total === null ? 'Waiting for route' : formatPrice(total)}</strong></div>
      </aside>
    )
  }

  function renderDeliveryForm() {
    if (step === 'contact') {
      return (
        <form className="checkout-panel" onSubmit={(event) => { event.preventDefault(); onNavigate('address') }}>
          <h2>Contact Details</h2>
          <p>We’ll use these details for order confirmation and delivery updates.</p>
          <div className="checkout-fields">
            <label className="checkout-field"><span>First name</span><input autoComplete="given-name" required maxLength={20} title="Use letters only, up to 20 characters." value={contactFirstName} onChange={(event) => setContactFirstName(sanitizeName(event.target.value))} /></label>
            <label className="checkout-field"><span>Last name</span><input autoComplete="family-name" required maxLength={20} title="Use letters only, up to 20 characters." value={contactLastName} onChange={(event) => setContactLastName(sanitizeName(event.target.value))} /></label>
            <label className="checkout-field"><span>Email</span><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label className="checkout-field"><span>Mobile</span><input autoComplete="tel" type="tel" inputMode="numeric" pattern="09[0-9]{9}" maxLength={11} title="Enter an 11-digit Philippine mobile number starting with 09." required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="09XXXXXXXXX" /></label>
          </div>
          <label className="checkout-updates"><input type="checkbox" checked={saveUpdates} onChange={(event) => setSaveUpdates(event.target.checked)} /> Send me order and delivery updates by email and mobile.</label>
          <button className="checkout-primary" type="submit">Continue to Address</button>
        </form>
      )
    }

    if (step === 'address') {
      return (
        <form className="checkout-panel" onSubmit={(event) => { event.preventDefault(); onNavigate('shipping') }}>
          <h2>Shipping address</h2>
          <p>Enter the address where your order should arrive.</p>
          {savedAddresses.length > 0 && <label className="checkout-field"><span>Use a saved address</span><select value="" onChange={(event) => {
            const address = savedAddresses.find((candidate) => candidate.id === event.target.value)
            if (!address) return
            const names = address.recipientName.trim().split(/\s+/)
            setContactFirstName(names.shift() ?? '')
            setContactLastName(names.join(' '))
            setPhone(address.phone)
            setStreetAddress(address.addressLine1)
            setBarangay(address.addressLine2.replace(/^Brgy\.\s*/i, ''))
            setCity(address.city)
            setProvince(address.province)
            setPostalCode(address.postalCode)
          }}><option value="">Choose saved address</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.addressLine1}, {address.city}</option>)}</select></label>}
          <div className="checkout-fields">
            <label className="checkout-field"><span>Street address</span><input required autoComplete="street-address" value={streetAddress} onChange={(event) => setStreetAddress(event.target.value)} placeholder="House no., street, building" /></label>
            <label className="checkout-field"><span>Barangay</span><input required autoComplete="address-level3" value={barangay} onChange={(event) => setBarangay(event.target.value)} placeholder="Barangay name" /></label>
            <label className="checkout-field"><span>City / Municipality</span><select required autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)}><option value="" disabled>Select your city or municipality</option>{cityMunicipalityOptions.map((location) => <option key={location}>{location}</option>)}</select></label>
            <label className="checkout-field">
              <span>Province / Region</span>
              <select required autoComplete="address-level1" value={province} onChange={(event) => setProvince(event.target.value)}>
                <option value="" disabled>Select your province or region</option>
                {provinceOptions.map((region) => (
                  <optgroup key={region.region} label={region.region}>
                    {region.locations.map((location) => <option key={location} value={location}>{location}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="checkout-field checkout-field-short"><span>Postal code</span><input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} title="Enter a 4-digit postal code." autoComplete="postal-code" value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
          </div>
          <div className="checkout-actions">
            <button className="checkout-secondary" type="button" onClick={() => onNavigate('contact')}>Back</button>
            <button className="checkout-primary" type="submit">Continue</button>
          </div>
        </form>
      )
    }

    if (step === 'shipping') {
      return (
        <section className="checkout-panel">
          <h2>Delivery Method</h2>
          <p>Google Maps calculates a driving route from the PLM warehouse to your shipping address. Delivery fees use AquaShield’s distance bands.</p>
          <GoogleRoutePreview destination={fullAddress ? `${fullAddress}, Philippines` : ''} onRoute={updateRouteDistance} />
          <div className="checkout-choice-list">
            {deliveryOptions.map((option) => (
              (() => {
                const fee = shippingFee(option.name, routeDistanceKm)
                return (
              <label className={`checkout-choice${deliveryMethod === option.name ? ' selected' : ''}`} key={option.name}>
                <input type="radio" name="delivery-method" checked={deliveryMethod === option.name} onChange={() => setDeliveryMethod(option.name)} />
                <span><strong>{option.name}</strong><small>{option.timing}{routeDistanceKm !== null && option.name !== 'Barangay / Hub Pickup' ? ` · ${routeDistanceKm.toFixed(1)} km` : ''}</small></span>
                <b>{fee === null ? 'Route needed' : fee === 0 ? 'FREE' : formatPrice(fee)}</b>
              </label>
                )
              })()
            ))}
          </div>
          <div className="checkout-actions">
            <button className="checkout-secondary" type="button" onClick={() => onNavigate('address')}>Back</button>
            <button className="checkout-primary" type="button" disabled={deliveryMethod !== 'Barangay / Hub Pickup' && routeDistanceKm === null} onClick={() => onNavigate('payment')}>Continue to Payment</button>
          </div>
        </section>
      )
    }
    return null
  }

  function renderPaymentStep() {
    if (step === 'payment') {
      return (
        <section className="checkout-panel">
          <h2>Choose a payment method</h2>
          <p>Your delivery details are saved. Choose how you’d like to pay.</p>
          <div className="checkout-choice-list">
            {(['GCash', 'Maya', 'Cash on Delivery'] as PaymentMethod[]).map((method) => (
              <label className={`checkout-choice${paymentMethod === method ? ' selected' : ''}`} key={method}>
                <input type="radio" name="payment-method" checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} />
                <span><strong>{method}</strong><small>{method === 'Cash on Delivery' ? 'Pay when your order arrives' : 'Pay with your digital wallet'}</small></span>
                <b>{paymentMethod === method ? 'Selected' : 'Choose'}</b>
              </label>
            ))}
          </div>
          <div className="checkout-actions">
            <button className="checkout-secondary" type="button" onClick={() => onNavigate('shipping')}>Back</button>
            <button className="checkout-primary" type="button" disabled={!hasRequiredBulkOrder} onClick={() => onNavigate('review')}>Continue to Review</button>
          </div>
        </section>
      )
    }

    if (step === 'review') {
      return (
        <section className="checkout-panel">
          <h2>Review your order</h2>
          <p>Confirm your delivery and payment details before placing your order.</p>
          <dl className="checkout-review-details">
            <div><dt>Deliver to</dt><dd>{contactName}<br />{fullAddress}</dd></div>
            <div><dt>Contact</dt><dd>{email}<br />{phone}</dd></div>
            <div><dt>Delivery</dt><dd>{deliveryMethod}</dd></div>
            <div><dt>Payment</dt><dd>{paymentMethod}</dd></div>
          </dl>
          <div className="checkout-actions">
            <button className="checkout-secondary" type="button" onClick={() => onNavigate('payment')}>Back</button>
            <button className="checkout-primary" type="button" disabled={!hasRequiredBulkOrder} onClick={() => onNavigate('processing')}>Place order</button>
          </div>
        </section>
      )
    }

    if (step === 'processing') {
      return (
        <section className="checkout-panel checkout-status-panel" aria-live="polite">
          <span className="checkout-status-icon processing">●</span>
          <h2>Processing your order...</h2>
          <p>Please wait while we confirm your order.</p>
          <div className="checkout-progress"><span /></div>
        </section>
      )
    }
    return null
  }

  if (items.length === 0 && step !== 'success') {
    return (
      <main className="checkout-page">
        <section className="checkout-empty">
          <h1>Your cart is empty</h1>
          <p>Add items to your cart before starting checkout.</p>
          <button className="checkout-primary" type="button" onClick={onViewOrders}>View My Orders</button>
        </section>
      </main>
    )
  }

  if (step === 'success' && completedOrder) {
    const walletPayment = completedOrder.paymentMethod === 'GCash' || completedOrder.paymentMethod === 'Maya'
    return (
      <main className="checkout-page">
        <section className="checkout-success-card">
          <span className="checkout-status-icon success">✓</span>
          <h1>Order confirmed</h1>
          <dl className="checkout-review-details">
            <div><dt>Order</dt><dd>{completedOrder.id}</dd></div>
            <div><dt>Subtotal</dt><dd>{formatPrice(completedOrder.subtotal)}</dd></div>
            <div><dt>VAT (12%)</dt><dd>{formatPrice(completedOrder.tax)}</dd></div>
            <div><dt>Shipping</dt><dd>{completedOrder.shipping === 0 ? 'FREE' : formatPrice(completedOrder.shipping)}</dd></div>
            <div><dt>Total</dt><dd>{formatPrice(completedOrder.total)}</dd></div>
            <div><dt>Status</dt><dd>{completedOrder.status}</dd></div>
            {walletPayment && <div><dt>Payment</dt><dd>{completedOrder.paymentStatus === 'paid' ? 'Payment recorded' : completedOrder.paymentStatus === 'failed' ? 'Payment not completed' : 'Awaiting payment'}</dd></div>}
          </dl>
          {walletPayment && completedOrder.paymentStatus !== 'paid' && (
            <div className="checkout-demo-note">
              <strong>Simulate {completedOrder.paymentMethod}</strong>
              <div className="checkout-actions">
                <button className="checkout-secondary" type="button" disabled={paymentSimulationBusy} onClick={async () => {
                  setPaymentSimulationBusy(true)
                  try { setCompletedOrder(await onSimulatePayment(completedOrder, false)) }
                  catch (error) { setOrderSubmitMessage(error instanceof Error ? error.message : 'Payment simulation failed.') }
                  finally { setPaymentSimulationBusy(false) }
                }}>Simulate decline</button>
                <button className="checkout-primary" type="button" disabled={paymentSimulationBusy} onClick={async () => {
                  setPaymentSimulationBusy(true)
                  try { setCompletedOrder(await onSimulatePayment(completedOrder, true)) }
                  catch (error) { setOrderSubmitMessage(error instanceof Error ? error.message : 'Payment simulation failed.') }
                  finally { setPaymentSimulationBusy(false) }
                }}>{paymentSimulationBusy ? 'Saving…' : 'Simulate successful payment'}</button>
              </div>
              {orderSubmitMessage && <p role="alert">{orderSubmitMessage}</p>}
            </div>
          )}
          <div className="checkout-actions">
            <button className="checkout-secondary" type="button" onClick={onViewOrders}>View Order History</button>
            <button className="checkout-secondary" type="button" onClick={() => onInvoice(completedOrder.id)}>View Invoice</button>
            <button className="checkout-primary" type="button" onClick={onTrackOrder}>Track Order</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="checkout-page">
      <nav className="checkout-progress-steps" aria-label="Checkout progress">
        {(['Delivery', 'Payment', 'Review'] as const).map((label, index) => (
          <div className={`checkout-progress-step${activeStep === label ? ' active' : ''}${['Delivery', 'Payment', 'Review'].indexOf(activeStep) > index ? ' complete' : ''}`} key={label}>
            <span>{index + 1}</span><strong>{label}</strong>
          </div>
        ))}
      </nav>
      <h1 className="checkout-page-title">Checkout</h1>
      <p className="checkout-page-subtitle">Delivery, payment and final review.</p>
      {orderSubmitMessage && <p className="checkout-error-message" role="alert">{orderSubmitMessage}</p>}
      {audienceType === 'organization' && !hasRequiredBulkOrder && step !== 'success' && (
        <p className="checkout-bulk-required" role="status">Add an organization order of at least 20 units before continuing to review.</p>
      )}
      <div className="checkout-layout">
        {renderDeliveryForm() ?? renderPaymentStep()}
        {renderOrderSummary()}
      </div>
      
    </main>
  )
}

function OrdersPage({
  orders,
  onTrackOrder,
  onInvoice,
  onViewProduct,
  onWriteReview,
}: {
  orders: OrderRecord[]
  onTrackOrder: (orderId?: string) => void
  onInvoice: (orderId: string) => void
  onViewProduct: (product: Product) => void
  onWriteReview: (product: Product) => void
}) {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? '')
  useEffect(() => {
    if (!orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(orders[0]?.id ?? '')
    }
  }, [orders, selectedOrderId])
  const selectedOrder = orders.find((order) => order.id === selectedOrderId)

  return (
    <main className="account-orders-page">
      <section className="account-orders-profile">
        <h1>Order History</h1>
            <p>View and track your AquaShield orders.</p>
        <nav aria-label="Account">
          <span className="active">Orders</span>
          <a href="/track-order" onClick={(event) => { event.preventDefault(); onTrackOrder() }}>Track an Order</a>
        </nav>
      </section>
      <section className="account-orders-list">
        <h2>Orders</h2>
        {orders.length === 0 ? (
          <div className="account-orders-empty">
            <p>No orders yet.</p>
            <span>Your orders will appear here after checkout.</span>
          </div>
        ) : orders.map((order) => (
          <article className={`account-order-card${selectedOrderId === order.id ? ' selected' : ''}`} key={order.id}>
            <div><strong>{order.id}</strong><small>{order.createdAt} · {order.items.reduce((count, item) => count + item.quantity, 0)} items · {order.paymentMethod}</small></div>
            <strong>{formatPrice(order.total)}</strong>
            <span className={`account-order-status ${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</span>
            <button type="button" aria-expanded={selectedOrderId === order.id} onClick={() => setSelectedOrderId(order.id)}>View details</button>
          </article>
        ))}
        {selectedOrder && (
          <section className="account-order-detail">
            <div><span>Order number</span><strong>{selectedOrder.id}</strong></div>
            <div><span>Delivery address</span><strong>{selectedOrder.address}</strong></div>
            <div><span>Delivery method</span><strong>{selectedOrder.deliveryMethod}</strong></div>
            <div><span>Status</span><strong>{selectedOrder.status}</strong></div>
            <div className="account-order-items">
              <span>Items</span>
              {selectedOrder.items.map(({ product, quantity }, index) => (
                <div className="account-order-item" key={`${product.id}-${index}`}>
                  <strong>{product.name} · Qty {quantity}</strong>
                  <div>
                    <button type="button" onClick={() => onViewProduct(product)}>View product</button>
                    {selectedOrder.status === 'Delivered' && (
                      <button type="button" onClick={() => onWriteReview(product)}>Leave a review</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onTrackOrder(selectedOrder.id)}>Track this order</button>
            <button type="button" onClick={() => onInvoice(selectedOrder.id)}>View invoice</button>
          </section>
        )}
      </section>
    </main>
  )
}

function AddressBookPage({ addresses, onSave, onDelete }: {
  addresses: SavedAddress[]
  onSave: (address: Omit<SavedAddress, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const address = Object.fromEntries(['label', 'recipientName', 'phone', 'addressLine1', 'addressLine2', 'city', 'province', 'postalCode'].map((key) => [key, String(values.get(key) ?? '').trim()])) as Omit<SavedAddress, 'id'>
    setBusy(true); setMessage('')
    try { await onSave(address); form.reset(); setMessage('Address saved.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this address.') }
    finally { setBusy(false) }
  }
  return (
    <main className="account-orders-page">
      <section className="account-orders-profile"><h1>Saved Addresses</h1><p>Keep delivery details ready for your next order.</p></section>
      <section className="account-orders-list">
        <h2>Your addresses</h2>
        {addresses.length === 0 ? <div className="account-orders-empty"><p>No saved addresses yet.</p><span>Add an address below to make checkout faster.</span></div> : addresses.map((address) => (
          <article className="account-order-card" key={address.id}>
            <div><strong>{address.label} · {address.recipientName}</strong><small>{address.phone}</small><small>{[address.addressLine1, address.addressLine2, address.city, address.province, address.postalCode].filter(Boolean).join(', ')}</small></div>
            <button className="checkout-secondary" type="button" onClick={() => void onDelete(address.id)}>Remove</button>
          </article>
        ))}
        <form className="checkout-panel" onSubmit={save}>
          <h2>Add an address</h2>
          <div className="checkout-fields">
            <label className="checkout-field"><span>Label</span><input name="label" defaultValue="Home" required maxLength={40} /></label>
            <label className="checkout-field"><span>Recipient name</span><input name="recipientName" required maxLength={80} /></label>
            <label className="checkout-field"><span>Mobile</span><input name="phone" inputMode="numeric" pattern="09[0-9]{9}" maxLength={11} required /></label>
            <label className="checkout-field"><span>Street address</span><input name="addressLine1" required maxLength={160} /></label>
            <label className="checkout-field"><span>Barangay / unit</span><input name="addressLine2" maxLength={160} /></label>
            <label className="checkout-field"><span>City / Municipality</span><input name="city" required maxLength={100} /></label>
            <label className="checkout-field"><span>Province / Region</span><input name="province" required maxLength={100} /></label>
            <label className="checkout-field"><span>Postal code</span><input name="postalCode" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} /></label>
          </div>
          {message && <p role="status">{message}</p>}
          <button className="checkout-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        </form>
      </section>
    </main>
  )
}

const orderStatuses: OrderRecord['status'][] = [
  'Processing',
  'Packed',
  'Shipped',
  'Out for delivery',
  'Delivered',
  'Cancelled',
]
const fulfillmentStatuses: OrderRecord['status'][] = ['Awaiting payment', ...orderStatuses]

function AdminOrdersPage({
  products,
  categories,
  orders,
  customers,
  section,
  inventory,
  onSelectSection,
  onUpdateInventory,
  onCreateProduct,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onMoveProductCategory,
  onUpdateStatus,
  onTrackOrder,
  onInvoice,
  onInviteUser,
  onUpdateUser,
  onResetUserPassword,
}: {
  products: Product[]
  categories: string[]
  orders: OrderRecord[]
  customers: AdminCustomer[]
  section: AdminSection
  inventory: Record<number, number>
  onSelectSection: (section: AdminSection) => void
  onUpdateInventory: (productId: number, quantity: number) => void
  onCreateProduct: (product: NewProductInput) => Promise<void>
  onCreateCategory: (name: string) => Promise<void>
  onRenameCategory: (previousName: string, nextName: string) => Promise<void>
  onDeleteCategory: (name: string) => Promise<void>
  onMoveProductCategory: (productId: number, category: string) => Promise<void>
  onUpdateStatus: (orderId: string, status: OrderRecord['status']) => void
  onTrackOrder: (orderId: string) => void
  onInvoice: (orderId: string) => void
  onInviteUser: (user: { email: string; firstName: string; lastName: string; username: string; role: 'admin' | 'buyer' }) => Promise<void>
  onUpdateUser: (user: AdminCustomer) => Promise<void>
  onResetUserPassword: (userId: string) => Promise<void>
}) {
  const [filter, setFilter] = useState('All orders')
  const [inventoryFilter, setInventoryFilter] = useState('All products')
  const [inventoryInputs, setInventoryInputs] = useState<Record<number, string>>({})
  const [newProductMessage, setNewProductMessage] = useState('')
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [categoryMessage, setCategoryMessage] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editedCategoryName, setEditedCategoryName] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'buyer' | 'admin'>('all')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userMessage, setUserMessage] = useState('')
  const [userBusy, setUserBusy] = useState(false)
  const visibleOrders = orders.filter((order) => filter === 'All orders' || order.status === filter)
  const deliveredCount = orders.filter((order) => order.status === 'Delivered').length
  const inTransitCount = orders.filter((order) => ['Shipped', 'Out for delivery'].includes(order.status)).length
  const awaitingPaymentCount = orders.filter((order) => order.status === 'Awaiting payment').length
  const revenue = orders.filter((order) => order.status !== 'Awaiting payment').reduce((total, order) => total + order.subtotal, 0)
  const lowStockProducts = products.filter((product) => {
    const stock = inventory[product.id] ?? product.stock
    return stock > 0 && stock <= 10
  })
  const outOfStockProducts = products.filter((product) => (inventory[product.id] ?? product.stock) === 0)
  const unitsInStock = products.reduce((total, product) => total + (inventory[product.id] ?? product.stock), 0)
  function commitInventoryInput(productId: number) {
    const input = inventoryInputs[productId]
    if (input === undefined) return
    const quantity = Number(input)
    if (input.trim() !== '' && Number.isInteger(quantity) && quantity >= 0) {
      onUpdateInventory(productId, quantity)
    }
    setInventoryInputs((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
  }
  async function submitNewProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get('product-name') ?? '').trim()
    const description = String(formData.get('product-description') ?? '').trim()
    const category = String(formData.get('product-category') ?? '') as Category
    const price = Number(formData.get('product-price'))
    const stock = Number(formData.get('product-stock'))
    if (!name || !description || !categories.includes(category) || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setNewProductMessage('Enter a name, description, category, valid price, and whole-number stock amount.')
      return
    }
    setIsCreatingProduct(true)
    setNewProductMessage('')
    try {
      await onCreateProduct({ name, description, category, price, stock })
      form.reset()
      setNewProductMessage('Product added to the catalog.')
    } catch (error) {
      setNewProductMessage(error instanceof Error ? error.message : 'Could not add this product.')
    } finally {
      setIsCreatingProduct(false)
    }
  }
  const visibleCustomers = customers.filter((customer) => userRoleFilter === 'all' || customer.role === userRoleFilter)
  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const invitedUser = {
      email: String(values.get('invite-email') ?? '').trim(),
      firstName: String(values.get('invite-first-name') ?? '').trim(),
      lastName: String(values.get('invite-last-name') ?? '').trim(),
      username: String(values.get('invite-username') ?? '').trim(),
      role: String(values.get('invite-role') ?? 'buyer') as 'admin' | 'buyer',
    }
    setUserBusy(true)
    setUserMessage('')
    try {
      await onInviteUser(invitedUser)
      form.reset()
      setUserMessage(`Invitation sent to ${invitedUser.email}.`)
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : 'Could not invite this account.')
    } finally { setUserBusy(false) }
  }
  const itemSales = new Map<number, number>()
  for (const order of orders.filter((candidate) => candidate.status !== 'Awaiting payment')) {
    for (const item of order.items) {
      itemSales.set(item.product.id, (itemSales.get(item.product.id) ?? 0) + item.quantity)
    }
  }
  const categorySales = Object.entries(
    orders.filter((order) => order.status !== 'Awaiting payment').flatMap((order) => order.items).reduce<Record<string, number>>((totals, item) => {
      totals[item.product.category] = (totals[item.product.category] ?? 0) + item.product.price * item.quantity
      return totals
    }, {}),
  ).sort((first, second) => second[1] - first[1])
  const pageTitles: Record<AdminSection, { title: string; description: string }> = {
    overview: { title: 'Company overview', description: 'A snapshot of orders, sales, fulfillment, and stock.' },
    orders: { title: 'Order management', description: 'Review buyer orders, payment methods, and order status.' },
    customers: { title: 'Customer accounts', description: 'Review registered buyers and account roles.' },
    inventory: { title: 'Inventory control', description: 'Monitor stock levels and record manual stock adjustments.' },
    categories: { title: 'Category management', description: 'Organize products into clear storefront categories.' },
    fulfillment: { title: 'Fulfillment center', description: 'See which orders need packing, dispatch, or delivery follow-up.' },
    reports: { title: 'Business reports', description: 'Review sales mix and operational performance from placed orders.' },
  }
  const title = pageTitles[section]

  function renderOrderTable(orderList: OrderRecord[]) {
    if (orderList.length === 0) {
      return <div className="admin-empty-state"><span><Icon name="cart" /></span><h3>No buyer orders yet</h3><p>Orders placed in this browser will appear here.</p></div>
    }
    return (
      <div className="admin-order-table-wrap">
        <table className="admin-order-table">
          <thead><tr><th>Order</th><th>Buyer</th><th>Placed</th><th>Items</th><th>Total</th><th>Fulfillment status</th><th>Actions</th></tr></thead>
          <tbody>{orderList.map((order) => (
            <tr key={order.id}>
              <td><strong>{order.id}</strong><small>{order.paymentMethod}</small></td>
              <td><strong>{order.contactName}</strong><small>{order.email}</small></td>
              <td>{order.createdAt}</td>
              <td>{order.items.reduce((count, item) => count + item.quantity, 0)}</td>
              <td><strong>{formatPrice(order.total)}</strong></td>
              <td><select aria-label={`Update status for ${order.id}`} value={order.status} onChange={(event) => onUpdateStatus(order.id, event.target.value as OrderRecord['status'])}>
                {['Awaiting payment', ...orderStatuses].map((status) => <option key={status}>{status}</option>)}
              </select></td>
              <td><div className="admin-order-actions"><button type="button" onClick={() => onTrackOrder(order.id)}>Track</button><button type="button" onClick={() => onInvoice(order.id)}>Invoice</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )
  }

  return (
    <main className="admin-page">
      <div className="admin-page-heading">
        <div><span className="prepared-eyebrow">AquaShield operations</span><h1>{title.title}</h1><p>{title.description}</p></div>
      </div>
      <section className="admin-stat-grid" aria-label="Order summary">
        <article><span>Total orders</span><strong>{orders.length}</strong><small>{awaitingPaymentCount} awaiting payment</small></article>
        <article><span>Gross sales</span><strong>{formatPrice(revenue)}</strong><small>Excludes pending-payment orders</small></article>
        <article><span>In transit</span><strong>{inTransitCount}</strong><small>{deliveredCount} delivered</small></article>
        <article><span>Inventory units</span><strong>{unitsInStock.toLocaleString()}</strong><small>{lowStockProducts.length} low · {outOfStockProducts.length} out of stock</small></article>
      </section>
      {section === 'overview' && (
        <div className="admin-dashboard-grid">
          <section className="admin-orders-panel admin-dashboard-recent">
            <div className="admin-orders-toolbar"><div><h2>Recent orders</h2><p>Latest buyer activity</p></div><button type="button" onClick={() => onSelectSection('orders')}>View all orders</button></div>
            {renderOrderTable(orders.slice(0, 5))}
          </section>
          <section className="admin-orders-panel admin-dashboard-stock">
            <div className="admin-orders-toolbar"><div><h2>Stock alerts</h2><p>{lowStockProducts.length} low · {outOfStockProducts.length} out of stock</p></div><button type="button" onClick={() => onSelectSection('inventory')}>Manage stock</button></div>
            {lowStockProducts.length + outOfStockProducts.length === 0 ? <p className="admin-no-alerts">All products are above the low-stock threshold.</p> : (
              <ul className="admin-alert-list">{products.filter((product) => (inventory[product.id] ?? product.stock) <= 10).slice(0, 6).map((product) => <li key={product.id}><span><strong>{product.name}</strong><small>{product.category}</small></span><b>{stockAvailabilityLabel(inventory[product.id] ?? product.stock)}</b></li>)}</ul>
            )}
          </section>
          <section className="admin-orders-panel admin-dashboard-activity">
            <div className="admin-orders-toolbar"><div><h2>Order pipeline</h2><p>Orders by fulfillment status</p></div><button type="button" onClick={() => onSelectSection('fulfillment')}>Open fulfillment</button></div>
            <div className="admin-pipeline">{['Processing', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'].map((status) => <div key={status}><span>{status}</span><strong>{orders.filter((order) => order.status === status).length}</strong></div>)}</div>
          </section>
        </div>
      )}
      {section === 'orders' && <section className="admin-orders-panel"><div className="admin-orders-toolbar"><div><h2>Buyer orders</h2><p>{visibleOrders.length} order{visibleOrders.length === 1 ? '' : 's'} shown</p></div><label>Filter orders<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All orders</option>{orderStatuses.map((status) => <option key={status}>{status}</option>)}<option>Awaiting payment</option></select></label></div>{visibleOrders.length === 0 ? <div className="admin-empty-state"><h3>{orders.length === 0 ? 'No buyer orders yet' : 'No orders in this status'}</h3><p>{orders.length === 0 ? 'Orders placed in this browser will appear here.' : 'Choose another status filter to see more orders.'}</p></div> : renderOrderTable(visibleOrders)}</section>}
      {section === 'customers' && (
        <section className="admin-orders-panel">
          <div className="admin-orders-toolbar">
            <div><h2>Accounts</h2><p>{visibleCustomers.length} of {customers.length} accounts shown</p></div>
            <label>Filter by role<select aria-label="Filter accounts by role" value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value as typeof userRoleFilter)}><option value="all">All roles</option><option value="buyer">Buyers</option><option value="admin">Administrators</option></select></label>
          </div>
          {!supabaseConfigured && <p className="admin-product-message" role="status">Only accounts created in this browser are shown. Connect Supabase to view shared users and send invitations.</p>}
          <form className="admin-user-invite" onSubmit={(event) => { void submitInvite(event) }}>
            <div><span className="prepared-eyebrow">Account management</span><h3>Invite an account</h3><p>The recipient sets their own password from the email invitation.</p></div>
            <div className="admin-user-invite-fields">
              <label>Email<input name="invite-email" type="email" autoComplete="email" required /></label>
              <label>First name<input name="invite-first-name" required maxLength={80} /></label>
              <label>Last name<input name="invite-last-name" required maxLength={80} /></label>
              <label>Username<input name="invite-username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" /></label>
              <label>Role<select name="invite-role" defaultValue="buyer"><option value="buyer">Buyer</option><option value="admin">Administrator</option></select></label>
              <button className="checkout-primary" type="submit" disabled={userBusy || !supabaseConfigured}>{userBusy ? 'Sending…' : 'Send invitation'}</button>
            </div>
            {userMessage && <p className="admin-product-message" role="status">{userMessage}</p>}
          </form>
          {visibleCustomers.length === 0 ? <div className="admin-empty-state"><h3>No accounts found</h3><p>Try another role filter.</p></div> : (
            <div className="admin-user-list">
              {visibleCustomers.map((customer) => (
                <article className="admin-user-card" key={customer.id}>
                  <div className="admin-user-summary">
                    <div><strong>{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'AquaShield buyer'}</strong><span>{customer.email || 'No email on file'} · {customer.username || 'No username'}</span></div>
                    <span className={`admin-user-role ${customer.role}`}>{customer.role === 'admin' ? 'Administrator' : 'Buyer'}</span>
                    <span className="admin-user-joined">{customer.createdAt ? `Joined ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(customer.createdAt))}` : 'Browser account'}</span>
                    <div className="admin-order-actions">
                      <button type="button" onClick={() => { setEditingUserId(editingUserId === customer.id ? null : customer.id); setUserMessage('') }}>{editingUserId === customer.id ? 'Close edit' : 'Edit details'}</button>
                      <button type="button" disabled={!customer.email || userBusy || !supabaseConfigured} onClick={async () => { setUserBusy(true); setUserMessage(''); try { await onResetUserPassword(customer.id); setUserMessage(`Password reset email requested for ${customer.email}.`) } catch (error) { setUserMessage(error instanceof Error ? error.message : 'Could not request a reset email.') } finally { setUserBusy(false) } }}>Send password reset</button>
                    </div>
                  </div>
                  {editingUserId === customer.id && (
                    <form className="admin-user-edit" onSubmit={async (event) => {
                      event.preventDefault()
                      const form = event.currentTarget
                      const fields = new FormData(form)
                      const updated = { ...customer, firstName: String(fields.get('firstName') ?? '').trim(), lastName: String(fields.get('lastName') ?? '').trim(), username: String(fields.get('username') ?? '').trim() || null, role: String(fields.get('role') ?? 'buyer') as 'buyer' | 'admin' }
                      setUserBusy(true); setUserMessage('')
                      try { await onUpdateUser(updated); setEditingUserId(null); setUserMessage('Account details updated.') }
                      catch (error) { setUserMessage(error instanceof Error ? error.message : 'Could not update this account.') }
                      finally { setUserBusy(false) }
                    }}>
                      <label>First name<input name="firstName" required maxLength={80} defaultValue={customer.firstName} /></label>
                      <label>Last name<input name="lastName" required maxLength={80} defaultValue={customer.lastName} /></label>
                      <label>Username<input name="username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" defaultValue={customer.username ?? ''} /></label>
                      <label>Role<select name="role" defaultValue={customer.role}><option value="buyer">Buyer</option><option value="admin">Administrator</option></select></label>
                      <button className="checkout-primary" type="submit" disabled={userBusy}>{userBusy ? 'Saving…' : 'Save changes'}</button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {section === 'inventory' && (
        <section className="admin-orders-panel">
          <div className="admin-orders-toolbar"><div><h2>Product inventory</h2><p>{products.length} products · {lowStockProducts.length} low · {outOfStockProducts.length} out of stock</p></div><label>Inventory view<select aria-label="Inventory view" value={inventoryFilter} onChange={(event) => setInventoryFilter(event.target.value)}><option>All products</option><option>Low stock only</option><option>Out of stock only</option></select></label></div>
          <form className="admin-create-product-form" onSubmit={(event) => { void submitNewProduct(event) }}>
            <div><span className="prepared-eyebrow">Catalog management</span><h3>Add a product</h3><p>New products start with validated price and stock values.</p></div>
            <div className="admin-create-product-fields">
              <label>Product name<input name="product-name" required maxLength={120} /></label>
              <label>Category<select name="product-category" required defaultValue=""><option value="" disabled>Select a category</option>{categories.filter((category) => category !== 'All items').map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Price (₱)<input name="product-price" type="number" min="0" step="0.01" required /></label>
              <label>Initial stock<input name="product-stock" type="number" min="0" step="1" defaultValue="0" required /></label>
              <label className="admin-create-product-description">Description<textarea name="product-description" rows={2} maxLength={600} required /></label>
              <button className="checkout-primary" type="submit" disabled={isCreatingProduct}>{isCreatingProduct ? 'Adding…' : 'Add product'}</button>
            </div>
            {newProductMessage && <p role="status" className="admin-product-message">{newProductMessage}</p>}
          </form>
          <div className="admin-order-table-wrap"><table className="admin-order-table admin-inventory-table"><thead><tr><th>Product</th><th>Category</th><th>Unit price</th><th>Units in stock</th><th>Availability</th></tr></thead><tbody>{products.filter((product) => inventoryFilter === 'All products' || (inventoryFilter === 'Low stock only' ? (inventory[product.id] ?? product.stock) > 0 && (inventory[product.id] ?? product.stock) <= 10 : (inventory[product.id] ?? product.stock) === 0)).map((product) => {
            const quantity = inventory[product.id] ?? product.stock
            return <tr key={product.id}>
              <td><div className="admin-inventory-product"><ProductArtwork productId={product.id} productName={product.name} image={product.image} className="admin-inventory-artwork" /><span><strong>{product.name}</strong><small>SKU-AS-{String(product.id).padStart(4, '0')}</small></span></div></td>
              <td>{product.category}</td><td>{formatPrice(product.price)}</td><td><input className="admin-stock-input" aria-label={`Units in stock for ${product.name}`} type="number" min="0" step="1" value={inventoryInputs[product.id] ?? quantity} onChange={(event) => {
                const input = event.target.value
                setInventoryInputs((current) => ({ ...current, [product.id]: input }))
              }} onBlur={() => commitInventoryInput(product.id)} /></td>
              <td><span className={`admin-stock-status${quantity === 0 ? ' empty' : quantity <= 10 ? ' low' : ''}`}>{stockAvailabilityLabel(quantity)}</span></td>
            </tr>
          })}</tbody></table></div>
        </section>
      )}
      {section === 'categories' && (
        <section className="admin-orders-panel admin-category-management">
          <div className="admin-orders-toolbar"><div><h2>Product categories</h2><p>{categories.filter((category) => category !== 'All items').length} categories · {products.length} products</p></div></div>
          <form className="admin-category-create" onSubmit={async (event) => {
            event.preventDefault()
            const name = newCategoryName.trim()
            if (!name) return
            setCategoryBusy(true); setCategoryMessage('')
            try { await onCreateCategory(name); setNewCategoryName(''); setCategoryMessage(`Added “${name}”.`) }
            catch (error) { setCategoryMessage(error instanceof Error ? error.message : 'Could not add this category.') }
            finally { setCategoryBusy(false) }
          }}>
            <label>New category name<input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={80} required placeholder="e.g. Home Safety" /></label>
            <button className="checkout-primary" type="submit" disabled={categoryBusy}>{categoryBusy ? 'Saving…' : 'Add category'}</button>
          </form>
          <div className="admin-category-list">
            {categories.filter((category) => category !== 'All items').map((category) => {
              const productCount = products.filter((product) => product.category === category).length
              return (
                <article className="admin-category-row" key={category}>
                  <div className="admin-category-name">
                    {editingCategory === category ? (
                      <form onSubmit={async (event) => {
                        event.preventDefault()
                        const name = editedCategoryName.trim()
                        if (!name) return
                        setCategoryBusy(true); setCategoryMessage('')
                        try { await onRenameCategory(category, name); setEditingCategory(null); setCategoryMessage('Category renamed.') }
                        catch (error) { setCategoryMessage(error instanceof Error ? error.message : 'Could not rename this category.') }
                        finally { setCategoryBusy(false) }
                      }}>
                        <input value={editedCategoryName} onChange={(event) => setEditedCategoryName(event.target.value)} maxLength={80} required aria-label={`Rename ${category}`} />
                        <button type="submit" disabled={categoryBusy}>Save</button>
                        <button type="button" onClick={() => setEditingCategory(null)}>Cancel</button>
                      </form>
                    ) : <><strong>{category}</strong><small>{productCount} {productCount === 1 ? 'product' : 'products'}</small></>}
                  </div>
                  {editingCategory !== category && <div className="admin-category-actions">
                    <button type="button" onClick={() => { setEditingCategory(category); setEditedCategoryName(category) }}>Rename</button>
                    <button type="button" disabled={categoryBusy || productCount > 0} title={productCount > 0 ? 'Move products out of this category first.' : 'Remove this category'} onClick={async () => {
                      setCategoryBusy(true); setCategoryMessage('')
                      try { await onDeleteCategory(category); setCategoryMessage(`Removed “${category}”.`) }
                      catch (error) { setCategoryMessage(error instanceof Error ? error.message : 'Could not remove this category.') }
                      finally { setCategoryBusy(false) }
                    }}>Remove</button>
                  </div>}
                </article>
              )
            })}
          </div>
          <div className="admin-orders-toolbar"><div><h2>Organize products</h2><p>Choose a category for each product.</p></div></div>
          <div className="admin-category-product-list">
            {products.map((product) => <label className="admin-category-product" key={product.id}>
              <span><strong>{product.name}</strong><small>{product.category}</small></span>
              <select aria-label={`Category for ${product.name}`} value={product.category} onChange={async (event) => {
                const nextCategory = event.target.value
                setCategoryBusy(true); setCategoryMessage('')
                try { await onMoveProductCategory(product.id, nextCategory); setCategoryMessage(`${product.name} moved to ${nextCategory}.`) }
                catch (error) { setCategoryMessage(error instanceof Error ? error.message : 'Could not move this product.') }
                finally { setCategoryBusy(false) }
              }} disabled={categoryBusy}>
                {categories.filter((value) => value !== 'All items').map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>)}
          </div>
          {categoryMessage && <p className="admin-product-message" role="status">{categoryMessage}</p>}
        </section>
      )}
      {section === 'fulfillment' && (
        <div className="admin-fulfillment-grid">{fulfillmentStatuses.map((status) => { const matchingOrders = orders.filter((order) => order.status === status); return <section className="admin-fulfillment-column" key={status}><header><strong>{status}</strong><span>{matchingOrders.length}</span></header>{matchingOrders.length === 0 ? <p>No orders</p> : matchingOrders.map((order) => <article key={order.id}><strong>{order.id}</strong><span>{order.contactName}</span><small>{order.address || 'No shipping address'}</small><b>{formatPrice(order.total)}</b><select aria-label={`Update status for ${order.id}`} value={order.status} onChange={(event) => onUpdateStatus(order.id, event.target.value as OrderRecord['status'])}>{fulfillmentStatuses.map((value) => <option key={value}>{value}</option>)}</select></article>)}</section> })}</div>
      )}
      {section === 'reports' && (
        <div className="admin-report-grid">
          <section className="admin-orders-panel"><div className="admin-orders-toolbar"><div><h2>Sales by product category</h2><p>Based on placed orders, excluding awaiting payment</p></div></div>{categorySales.length === 0 ? <div className="admin-empty-state"><h3>No sales data yet</h3><p>Completed checkouts will appear in reports.</p></div> : <div className="admin-report-bars">{categorySales.map(([category, value]) => <div key={category}><span>{category}</span><div><i style={{ width: `${Math.max(5, (value / categorySales[0][1]) * 100)}%` }} /></div><strong>{formatPrice(value)}</strong></div>)}</div>}</section>
          <section className="admin-orders-panel"><div className="admin-orders-toolbar"><div><h2>Best-selling products</h2><p>Units in paid or fulfilled orders</p></div></div>{itemSales.size === 0 ? <div className="admin-empty-state"><h3>No sales data yet</h3><p>Placed orders will populate this report.</p></div> : <ol className="admin-top-products">{[...itemSales.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5).map(([productId, quantity]) => { const product = products.find((item) => item.id === productId); return product ? <li key={productId}><span><strong>{product.name}</strong><small>{product.category}</small></span><b>{quantity} sold</b></li> : null })}</ol>}</section>
        </div>
      )}
    </main>
  )
}

function InvoicePage({
  order,
  onTrackOrder,
  onViewOrders,
}: {
  order: OrderRecord | undefined
  onTrackOrder: (orderId: string) => void
  onViewOrders: () => void
}) {
  if (!order) {
    return <main className="invoice-page"><section className="invoice-empty"><h1>Invoice unavailable</h1><p>We couldn’t find that order in this browser’s saved order history.</p><button type="button" onClick={onViewOrders}>View Order History</button></section></main>
  }

  return (
    <main className="invoice-page">
      <nav className="invoice-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={onViewOrders}>My Orders</button><span>/</span><span>Invoice</span></nav>
      <div className="invoice-heading"><div><span className="prepared-eyebrow">Order documentation</span><h1>Invoice</h1><p>A detailed summary of your AquaShield order and payment due.</p></div><span className={`invoice-payment-status ${order.status === 'Awaiting payment' ? 'pending' : ''}`}>{order.status === 'Awaiting payment' ? 'Awaiting payment' : 'Order confirmed'}</span></div>
      <div className="invoice-layout">
        <article className="invoice-document">
          <header className="invoice-brand-row"><img src={aquaLogo} alt="" /><div><strong>AQUASHIELD RELIEF CO.</strong><small>Emergency preparedness essentials</small></div><span>INVOICE</span></header>
          <div className="invoice-meta-grid">
            <div><small>INVOICE NUMBER</small><strong>INV-{order.id}</strong></div>
            <div><small>ISSUE DATE</small><strong>{order.createdAt}</strong></div>
            <div><small>PAYMENT DUE</small><strong>{order.status === 'Awaiting payment' ? 'Upon receipt' : 'No payment processed'}</strong></div>
            <div><small>ORDER NUMBER</small><strong>{order.id}</strong></div>
          </div>
          <div className="invoice-addresses">
            <div><small>BILL TO</small><strong>{order.contactName}</strong><span>{order.email}</span><span>{order.phone}</span></div>
            <div><small>SHIP TO</small><strong>{order.contactName}</strong><span>{order.address || 'Address not provided'}</span></div>
          </div>
          <div className="invoice-items-wrap">
            <table className="invoice-items"><thead><tr><th>Item description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
              <tbody>{order.items.map(({ product, quantity }) => <tr key={product.id}><td><div className="invoice-item-cell"><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.description}</small></span></div></td><td>{quantity}</td><td>{formatPrice(product.price)}</td><td>{formatPrice(product.price * quantity)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="invoice-totals">
            <p><span>Subtotal</span><strong>{formatPrice(order.subtotal)}</strong></p><p><span>VAT (12%)</span><strong>{formatPrice(order.tax)}</strong></p><p><span>Shipping</span><strong>{order.shipping === 0 ? 'FREE' : formatPrice(order.shipping)}</strong></p>
            <p className="invoice-total-due"><span>TOTAL DUE</span><strong>{formatPrice(order.total)}</strong></p>
          </div>
          <footer className="invoice-document-note">Thank you for choosing AquaShield Relief Co. · Stay ready. Stay safe.</footer>
        </article>
        <aside className="invoice-aside">
          <section><h2>Invoice Summary</h2><div className="invoice-summary-status"><span><Icon name="card" /></span><div><strong>{order.status === 'Awaiting payment' ? 'Payment pending' : 'No payment processed'}</strong><small>{order.paymentMethod}</small></div></div><dl><div><dt>Invoice reference</dt><dd>INV-{order.id}</dd></div><div><dt>Payment method</dt><dd>{order.paymentMethod}</dd></div></dl><button type="button" onClick={() => window.print()}>Download / Print Invoice</button></section>
          <section><h2>Delivery Details</h2><div className="invoice-delivery-method"><Icon name="truck" /><div><strong>{order.deliveryMethod}</strong><small>Delivery method</small></div></div><dl><div><dt>Order number</dt><dd>{order.id}</dd></div></dl><button className="invoice-track-button" type="button" onClick={() => onTrackOrder(order.id)}>Track this order</button></section>
          <section className="invoice-help"><h2>Need assistance?</h2><p>Need a billing correction or copy? Contact your customer support team.</p><a href="mailto:support@aquashield.example">Contact Help &amp; Support</a></section>
        </aside>
      </div>
    </main>
  )
}

function TrackOrderPage({ orders, initialOrderId, onViewOrders }: { orders: OrderRecord[]; initialOrderId: string; onViewOrders: () => void }) {
  const defaultOrderId = initialOrderId || orders[0]?.id || ''
  const [orderNumber, setOrderNumber] = useState(defaultOrderId)
  const [submittedOrderId, setSubmittedOrderId] = useState(defaultOrderId)
  const order = orders.find((candidate) => candidate.id.toLowerCase() === submittedOrderId.trim().toLowerCase())
  const trackingStages = ['Processing', 'Packed', 'Shipped', 'Out for delivery', 'Delivered']
  const activeStage = order
    ? Math.max(0, trackingStages.indexOf(order.status))
    : 0
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedOrderId(orderNumber)
  }

  return (
    <main className="track-order-page">
      <section className="track-order-hero">
        <span className="prepared-eyebrow">Delivery tracking</span>
        <h1>Track your emergency dispatch</h1>
        <p>Enter an AquaShield reference number to view delivery progress.</p>
        <form onSubmit={handleSubmit}>
          <input aria-label="Order number" required value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="e.g. ASR-12345678" />
          <button type="submit">Track Now</button>
        </form>
      </section>
      <section className="track-order-content">
        {order ? (
          <>
            <div className="track-order-card">
              <div className="track-order-card-heading"><div><span>Order number</span><h2>{order.id}</h2></div><div><span>Estimated delivery</span><strong>3–5 business days</strong></div></div>
              <ol className="track-order-timeline">
                {trackingStages.map((stage, index) => <li className={index <= activeStage ? 'complete' : ''} key={stage}><span>{index < activeStage ? '✓' : index + 1}</span><strong>{stage}</strong><small>{index === activeStage ? 'Current status' : index === 0 ? order.createdAt : index < activeStage ? 'Completed' : 'Upcoming'}</small></li>)}
              </ol>
              <p className="track-order-address"><strong>Shipping to</strong><br />{order.contactName} · {order.address}</p>
              <button className="track-order-history-button" type="button" onClick={onViewOrders}>View Order History</button>
            </div>
            <aside className="checkout-order-summary">
              <h2>Order Summary</h2>
              <ul>{order.items.map(({ product, quantity }) => <li key={product.id}><span>{product.name}<small>{product.description}</small><small>Unit price: {formatPrice(product.price)} · Qty: {quantity}</small></span><strong>{formatPrice(product.price)} × {quantity} = {formatPrice(product.price * quantity)}</strong></li>)}</ul>
              <div><span>Subtotal</span><strong>{formatPrice(order.subtotal)}</strong></div>
              <div><span>VAT (12%)</span><strong>{formatPrice(order.tax)}</strong></div>
              <div><span>Shipping</span><strong>{order.shipping === 0 ? 'FREE' : formatPrice(order.shipping)}</strong></div>
              <div className="checkout-summary-total"><span>Total paid / due</span><strong>{formatPrice(order.total)}</strong></div>
            </aside>
          </>
        ) : (
          <section className="account-orders-empty">
            <h2>{submittedOrderId ? 'Order not found' : 'No orders yet'}</h2>
            <p>{submittedOrderId ? 'Check the reference number and try again.' : 'Place an order to see its tracking details here.'}</p>
            <button type="button" onClick={onViewOrders}>View Order History</button>
          </section>
        )}
      </section>
    </main>
  )
}

function OrganizationCatalogPage({
  products: catalog,
  hasBulkOrder,
  onAddOrder,
  onAddGoBag,
}: {
  products: Product[]
  hasBulkOrder: boolean
  onAddOrder: (product: Product, quantity: number) => void
  onAddGoBag: (kitItems: Product[], quantity: number) => void
}) {
  const eligibleProducts = catalog.filter((product) => product.id !== 9 && product.id !== 10)
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [quantityInputs, setQuantityInputs] = useState<Record<number, string>>({})
  const [selectedKitItems, setSelectedKitItems] = useState<number[]>(() => eligibleProducts.slice(0, MIN_GO_BAG_ITEMS).map((product) => product.id))
  const [kitQuantity, setKitQuantity] = useState(20)
  const discount = getBulkDiscount(kitQuantity)
  const selectedKitProducts = eligibleProducts.filter((product) => selectedKitItems.includes(product.id))
  const kitPricePerBag = selectedKitProducts.reduce((total, product) => total + product.price, 0)
  const discountedKitPricePerBag = Math.round(kitPricePerBag * (1 - discount))

  function quantityFor(product: Product) {
    return quantities[product.id] ?? 20
  }

  return (
    <main className="organization-page">
      <nav className="product-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>Organization</span></nav>
      <section className="organization-hero">
        <span className="prepared-eyebrow">Organization purchasing</span>
        <h1>Preparedness supplies for your organization</h1>
        <p>Choose from the full AquaShield catalog and see volume pricing before you order. Organization discounts start at 20 units.</p>
        <div className="bulk-pricing-tiers organization-tier-summary" aria-label="Organization pricing tiers">
          <span>20+ units <strong>5% off</strong></span>
          <span>50+ units <strong>10% off</strong></span>
          <span>100+ units <strong>15% off</strong></span>
        </div>
      </section>
      <section className="organization-go-bag-builder" aria-labelledby="organization-go-bag-heading">
        <div className="prepared-products-heading">
          <span className="prepared-eyebrow">Custom organization kit</span>
          <h2 id="organization-go-bag-heading">Build a Go-Bag</h2>
          <p>Choose 7–15 supplies for each bag. The selected bulk tier discount applies to every item in your kit.</p>
        </div>
        <p className="organization-kit-selection-count" aria-live="polite">{selectedKitItems.length} of {MAX_GO_BAG_ITEMS} items selected · choose at least {MIN_GO_BAG_ITEMS}</p>
        <div className="organization-kit-tier-picker" role="group" aria-label="Number of Go-Bags">
          {[20, 50, 100].map((quantity) => (
            <button
              className={(quantity === 100 ? kitQuantity >= 100 : kitQuantity === quantity) ? 'selected' : ''}
              type="button"
              aria-pressed={quantity === 100 ? kitQuantity >= 100 : kitQuantity === quantity}
              key={quantity}
              onClick={() => setKitQuantity(quantity)}
            >
              {quantity === 100 ? '100+ bags · 15% off' : `${quantity} bags · ${quantity === 50 ? '10' : '5'}% off`}
            </button>
          ))}
        </div>
        {kitQuantity >= 100 && (
          <label className="organization-kit-custom-quantity">
            <span>Number of bags (100–1,000)</span>
            <input
              type="number"
              min={100}
              max={1000}
              value={kitQuantity}
              onChange={(event) => {
                const nextQuantity = Number(event.target.value)
                if (Number.isInteger(nextQuantity)) setKitQuantity(Math.max(100, Math.min(1000, nextQuantity)))
              }}
            />
          </label>
        )}
        <div className="organization-kit-items">
          {eligibleProducts.map((product) => {
            const selected = selectedKitItems.includes(product.id)
            const discountedPrice = Math.round(product.price * (1 - discount))
            return (
              <label className={`organization-kit-item${selected ? ' selected' : ''}`} key={product.id}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={(selected && selectedKitItems.length <= MIN_GO_BAG_ITEMS) || (!selected && selectedKitItems.length >= MAX_GO_BAG_ITEMS)}
                  onChange={() => setSelectedKitItems((current) => selected
                    ? current.filter((id) => id !== product.id)
                    : current.length < MAX_GO_BAG_ITEMS ? [...current, product.id] : current)}
                />
                <span><strong>{product.name}</strong><small>{formatPrice(product.price)} → {formatPrice(discountedPrice)} per bag</small></span>
              </label>
            )
          })}
        </div>
        <div className="organization-kit-summary">
          <div><span>Selected items</span><strong>{selectedKitProducts.length}</strong></div>
          <div><span>Per bag after {Math.round(discount * 100)}% discount</span><strong>{formatPrice(discountedKitPricePerBag)}</strong></div>
          <div><span>{kitQuantity} bags total</span><strong>{formatPrice(discountedKitPricePerBag * kitQuantity)}</strong></div>
          <button
            className="checkout-primary"
            type="button"
            disabled={selectedKitProducts.length === 0}
            onClick={() => onAddGoBag(selectedKitProducts, kitQuantity)}
          >
            Add Custom Go-Bag to Cart
          </button>
        </div>
      </section>
      <section className="organization-catalog" aria-labelledby="organization-catalog-heading">
        <div className="prepared-products-heading">
          <span className="prepared-eyebrow">Organization catalog</span>
          <h2 id="organization-catalog-heading">Browse all products</h2>
        </div>
        <div className="organization-pricing-table-wrap">
          <table className="organization-pricing-table">
            <thead><tr><th>Product</th><th>Retail</th><th>20+ (5% off)</th><th>50+ (10% off)</th><th>100+ (15% off)</th></tr></thead>
            <tbody>
              {eligibleProducts.map((product) => (
                <tr key={product.id}>
                  <th scope="row">{product.name}</th>
                  <td>{formatPrice(product.price)}</td>
                  <td>{formatPrice(product.organizationDiscountPrice)}</td>
                  <td>{formatPrice(Math.round(product.price * 0.9))}</td>
                  <td>{formatPrice(Math.round(product.price * 0.85))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="organization-product-grid">
          {eligibleProducts.map((product) => {
            const quantity = quantityFor(product)
            const discount = getBulkDiscount(quantity)
            const unitPrice = Math.round(product.price * (1 - discount))
            return (
              <article className="organization-product-card" key={product.id}>
                <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
                <div className="organization-product-info">
                  <span>{product.category}</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <strong>{formatPrice(quantity === 20 ? product.organizationDiscountPrice : unitPrice)} <small>per unit · {Math.round(discount * 100)}% off</small></strong>
                  <label className="checkout-field">
                    <span>Quantity (minimum 20)</span>
                    <span className="organization-quantity-control">
                      <button
                        type="button"
                        aria-label={`Decrease ${product.name} quantity`}
                        disabled={quantity <= 20}
                        onClick={() => {
                          const nextQuantity = Math.max(20, quantity - 1)
                          setQuantities((current) => ({ ...current, [product.id]: nextQuantity }))
                          setQuantityInputs((current) => ({ ...current, [product.id]: String(nextQuantity) }))
                        }}
                      >−</button>
                      <input
                        type="number"
                        min={20}
                        max={1000}
                        step={1}
                        value={quantityInputs[product.id] ?? String(quantity)}
                        aria-label={`${product.name} quantity`}
                        onChange={(event) => {
                          const input = event.target.value
                          setQuantityInputs((current) => ({ ...current, [product.id]: input }))
                          if (/^\d+$/.test(input)) {
                            const nextQuantity = Math.min(1000, Math.max(20, Number(input)))
                            setQuantities((current) => ({ ...current, [product.id]: nextQuantity }))
                          }
                        }}
                        onBlur={() => {
                          const input = quantityInputs[product.id]
                          if (input === undefined) return
                          const nextQuantity = /^\d+$/.test(input) ? Math.min(1000, Math.max(20, Number(input))) : 20
                          setQuantities((current) => ({ ...current, [product.id]: nextQuantity }))
                          setQuantityInputs((current) => ({ ...current, [product.id]: String(nextQuantity) }))
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${product.name} quantity`}
                        disabled={quantity >= 1000}
                        onClick={() => {
                          const nextQuantity = Math.min(1000, quantity + 1)
                          setQuantities((current) => ({ ...current, [product.id]: nextQuantity }))
                          setQuantityInputs((current) => ({ ...current, [product.id]: String(nextQuantity) }))
                        }}
                      >+</button>
                    </span>
                  </label>
                  <span className="organization-product-total">Order total: {formatPrice(unitPrice * quantity)}</span>
                  <button className="checkout-primary organization-cart-icon" type="button" aria-label={`Add ${product.name} to cart`} title="Add to cart" onClick={() => onAddOrder(product, quantity)}>
                    <Icon name="cart" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {hasBulkOrder && <p className="bulk-order-existing" role="status">Adding another organization order replaces the existing bulk-order line in your cart.</p>}
      </section>
    </main>
  )
}

function AudienceModePrompt({ onChoose }: { onChoose: (mode: AudienceType) => void }) {
  return (
    <div className="audience-prompt-backdrop">
      <section className="audience-prompt" role="dialog" aria-modal="true" aria-labelledby="audience-prompt-title">
        <span className="prepared-eyebrow">Welcome to AquaShield</span>
        <h1 id="audience-prompt-title">Who are you shopping for?</h1>
        <p>Choose a shopping mode. You can switch modes at any time.</p>
        <div className="audience-prompt-options">
          <button type="button" onClick={() => onChoose('solo')}>
            <span className="audience-prompt-icon"><Icon name="users" /></span>
            <strong>Solo / Family</strong>
            <small>Standard shopping with regular retail prices.</small>
          </button>
          <button type="button" onClick={() => onChoose('organization')}>
            <span className="audience-prompt-icon"><Icon name="building" /></span>
            <strong>Organization</strong>
            <small>Bulk pricing for orders of 20+ pieces per item.</small>
          </button>
        </div>
      </section>
    </div>
  )
}

type CartNotice =
  | { type: 'maximum'; product: Product }
  | { type: 'minimum'; product: Product }
  | { type: 'remove'; product: Product }
  | null

type PendingModeSwitch = {
  audience: AudienceType
  bulkOrder?: { product: Product; quantity: number }
  organizationGoBag?: { products: Product[]; quantity: number }
}
  | null

function CartNoticeModal({
  notice,
  quantity,
  onClose,
  onConfirmRemove,
}: {
  notice: Exclude<CartNotice, null>
  quantity: number
  onClose: () => void
  onConfirmRemove: (product: Product) => void
}) {
  const isMaximum = notice.type === 'maximum'
  const isMinimum = notice.type === 'minimum'
  const maximum = notice.product.id === 10 ? 1000 : notice.product.stockWarning ? 2 : 10

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="cart-notice-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="cart-notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="cart-notice-title">
        {isMaximum ? (
          <>
            <span className="cart-notice-icon maximum" aria-hidden="true">!</span>
            <h2 id="cart-notice-title">Maximum available quantity reached</h2>
            <p>Only {maximum} units of this item are currently available. Your cart quantity has not been increased.</p>
            <button className="cart-notice-primary" type="button" onClick={onClose}>Got It</button>
          </>
        ) : isMinimum ? (
          <>
            <span className="cart-notice-icon maximum" aria-hidden="true">!</span>
            <h2 id="cart-notice-title">Minimum bulk quantity required</h2>
            <p>Organization pricing starts at 20 units. Use Remove to delete the bulk order from your cart.</p>
            <button className="cart-notice-primary" type="button" onClick={onClose}>Got It</button>
          </>
        ) : (
          <>
            <h2 id="cart-notice-title">Remove this item?</h2>
            <p>{notice.product.name} will be removed from your cart.</p>
            <div className="cart-notice-product">
              <ProductArtwork productId={notice.product.id} productName={notice.product.name} />
              <div><strong>{notice.product.name}</strong><span>Qty {quantity} · {formatPrice(notice.product.price)}</span></div>
            </div>
            <div className="cart-notice-actions">
              <button className="cart-notice-secondary" type="button" onClick={onClose}>Keep Item</button>
              <button className="cart-notice-remove" type="button" onClick={() => onConfirmRemove(notice.product)}>Remove</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [buyerFirstName, setBuyerFirstName] = useState('')
  const [buyerMenuOpen, setBuyerMenuOpen] = useState(false)
  const [authPage, setAuthPage] = useState<AuthPage>(() => initialAuthPage() ?? 'login')
  const [authEmail, setAuthEmail] = useState(() => new URLSearchParams(window.location.search).get('email') ?? '')
  const [isShopPage, setIsShopPage] = useState(() => window.location.pathname === '/shop')
  const [isSearchPage, setIsSearchPage] = useState(() => window.location.pathname === '/search')
  const [isCartPage, setIsCartPage] = useState(() => window.location.pathname === '/cart')
  const [isOrganizationPage, setIsOrganizationPage] = useState(() =>
    window.location.pathname === '/organization',
  )
  const [isStockCheckPage, setIsStockCheckPage] = useState(initialStockCheckPage)
  const [isCheckoutPage, setIsCheckoutPage] = useState(initialCheckoutPage)
  const [checkoutStep, setCheckoutStep] = useState(initialCheckoutStep)
  const [accountPage, setAccountPage] = useState<AccountPage>(initialAccountPage)
  const [adminSection, setAdminSection] = useState<AdminSection>('overview')
  const [trackingOrderId, setTrackingOrderId] = useState(initialTrackingOrderId)
  const [orders, setOrders] = useState<OrderRecord[]>(() => supabaseConfigured ? [] : initialSavedDemoData.orders)
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([])
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(() => supabaseConfigured ? demoProducts : initialSavedDemoData.products)
  const [catalogCategories, setCatalogCategories] = useState<string[]>(() => supabaseConfigured ? [...categories] : initialSavedDemoData.categories)
  const [, setCatalogMessage] = useState(
    supabaseConfigured
      ? 'Connecting to the product database…'
      : initialSavedDemoData.warning ?? 'Changes are saved only in this browser. Do not enter real personal or payment details.',
  )
  const [inventory, setInventory] = useState<Record<number, number>>(() =>
    supabaseConfigured
      ? Object.fromEntries(demoProducts.map((product) => [product.id, product.stock]))
      : initialSavedDemoData.inventory,
  )
  const [productRoute, setProductRoute] = useState<ProductRoute>(getProductRoute)
  const [productQuantity, setProductQuantity] = useState(1)
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All items')
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>(null)
  const [priceFilter, setPriceFilter] = useState<string | null>(null)
  const [isFiltersOpen, setFiltersOpen] = useState(true)
  const [shopPage, setShopPage] = useState(1)
  const [isSidebarCategoriesOpen, setSidebarCategoriesOpen] = useState(true)
  const [isMobileCategoryMenuOpen, setMobileCategoryMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery)
  const [cart, setCart] = useState<Record<number, number>>({})
  const [bulkCartProduct, setBulkCartProduct] = useState<Product | null>(null)
  const [organizationGoBagItems, setOrganizationGoBagItems] = useState<number[]>([])
  const [audienceType, setAudienceType] = useState<AudienceType>(() =>
    window.location.pathname === '/organization' ? 'organization' : 'solo',
  )
  const [hasChosenAudience, setHasChosenAudience] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [lastAddedProductId, setLastAddedProductId] = useState<number | null>(null)
  const [cartNotice, setCartNotice] = useState<CartNotice>(null)
  const [pendingModeSwitch, setPendingModeSwitch] = useState<PendingModeSwitch | null>(null)
  const [cartMessage, setCartMessage] = useState('')
  const [cartToastVersion, setCartToastVersion] = useState(0)
  const [selectedBundleItems, setSelectedBundleItems] = useState<number[]>(() => demoProducts.slice(0, MIN_GO_BAG_ITEMS).map((product) => product.id))
  const [bundleSelectionMessage, setBundleSelectionMessage] = useState('')
  const [cartBundlePrice, setCartBundlePrice] = useState(0)
  const [customerReviews, setCustomerReviews] = useState<Record<number, CustomerReview[]>>(() =>
    supabaseConfigured ? {} : initialSavedDemoData.customerReviews,
  )

  const lowStockProductsCount = catalogProducts.filter((product) => (inventory[product.id] ?? product.stock) <= 10).length

  useEffect(() => {
    if (supabaseConfigured || initialSavedDemoData.preserveStoredData) return
    try {
      window.localStorage.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify({
        catalogSignature: makeDemoCatalogSignature(),
        orders,
        products: catalogProducts,
        inventory,
        customerReviews,
        categories: catalogCategories,
      }))
    } catch {
      setCatalogMessage('Browser storage is full or unavailable. Changes may not survive a refresh.')
    }
  }, [catalogCategories, catalogProducts, customerReviews, inventory, orders])

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return catalogProducts.filter((product) => {
      const matchesCategory =
        activeCategory === 'All items' || product.category === activeCategory
      const matchesSearch =
        query.length === 0 ||
        `${product.name} ${product.description} ${product.category}`
          .toLowerCase()
          .includes(query)

      return matchesCategory && matchesSearch
    })
  }, [activeCategory, catalogProducts, searchQuery])

  const bundleSubtotal = catalogProducts
    .filter((product) => selectedBundleItems.includes(product.id))
    .reduce((total, product) => total + product.price, 0)
  const bundleDiscount = Math.round(bundleSubtotal * 0.1)
  const bundleTotal = bundleSubtotal - bundleDiscount
  const isOrganizationGoBag = audienceType === 'organization' && Boolean(cart[9]) && organizationGoBagItems.length > 0
  const organizationGoBagContents = catalogProducts
    .filter((product) => organizationGoBagItems.includes(product.id))
    .map((product) => product.name)
    .join(', ')
  const customBundleProduct: Product = {
    id: 9,
    name: isOrganizationGoBag ? 'Custom Organization Go-Bag' : 'Custom Go-Bag Bundle',
    description: isOrganizationGoBag
      ? `Kit includes: ${organizationGoBagContents}. ${cart[9]} bags · ${Math.round(getBulkDiscount(cart[9]) * 100)}% organization discount`
      : `${selectedBundleItems.length} selected emergency essentials · 10L dry bag included`,
    category: 'Barangay Bundles',
    price: cart[9] ? cartBundlePrice : bundleTotal,
    image: makeProductImage(9, 'Custom Go-Bag Bundle', 'Barangay Bundles'),
    stock: isOrganizationGoBag ? 1000 : 10,
    organizationDiscountPrice: Math.round((cart[9] ? cartBundlePrice : bundleTotal) * 0.95),
  }
  const bulkOrderProduct = bulkCartProduct && cart[10] > 0
    ? {
        ...bulkCartProduct,
        id: 10,
        name: `Bulk order: ${bulkCartProduct.name}`,
        description: audienceType === 'organization'
          ? `${cart[10]} units · ${Math.round(getBulkDiscount(cart[10]) * 100)}% organization discount`
          : `${cart[10]} units`,
        price: Math.round(bulkCartProduct.price * (1 - (audienceType === 'organization' ? getBulkDiscount(cart[10]) : 0))),
      }
    : null
  const cartItems = [
    ...catalogProducts.filter((product) => (cart[product.id] ?? 0) > 0),
    ...(cart[customBundleProduct.id] ? [customBundleProduct] : []),
    ...(bulkOrderProduct ? [bulkOrderProduct] : []),
  ]
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0)
  const cartTotal = cartItems.reduce(
    (total, product) => total + product.price * (cart[product.id] ?? 0),
    0,
  )

  useEffect(() => {
    if (!cartMessage || cartToastVersion === 0) return
    const timer = window.setTimeout(() => setCartMessage(''), 2600)
    return () => window.clearTimeout(timer)
  }, [cartToastVersion, cartMessage])

  function showCartToast(message: string) {
    setCartMessage(message)
    setCartToastVersion((version) => version + 1)
  }

  async function refreshCategories() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('categories')
      .select('name, display_order')
      .eq('is_active', true)
      .order('display_order')
      .order('name')
    if (error) {
      setCatalogMessage(`Could not load categories: ${error.message}`)
      return
    }
    setCatalogCategories(['All items', ...(data ?? []).map((row) => row.name)])
  }

  async function refreshCatalog() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, price, stock_quantity, is_kit_bag, categories(name)')
      .eq('is_active', true)
      .order('id')
    if (error) {
      setCatalogMessage(`Database connection failed; showing the product catalog. ${error.message}`)
      setCatalogProducts(demoProducts)
      return
    }
    const nextProducts: Product[] = (data ?? []).map((row) => {
      const id = Number(row.id)
      const price = Number(row.price)
      const stock = Number(row.stock_quantity)
      const categoryRow = row.categories as { name?: string } | null
      const category = categoryRow?.name ?? 'Tools & Equipment'
      return {
        id,
        name: row.name,
        description: row.description ?? '',
        category,
        price,
        image: productNameImageMap[row.name] ?? firstEightProductImages[id] ?? makeProductImage(id, row.name, category),
        stock,
        stockWarning: stock <= 10,
        organizationDiscountPrice: Math.round(price * 0.95),
        isKitBag: Boolean(row.is_kit_bag),
      }
    })
    setCatalogProducts(nextProducts)
    setInventory(Object.fromEntries(nextProducts.map((product) => [product.id, product.stock])))
    setCatalogMessage(`Connected to the shared catalog · ${nextProducts.length} products`)
  }

  async function refreshOrders() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, payment_status, payment_method, delivery_method, contact_name, email, phone, address_line1, address_line2, city, province, postal_code, subtotal, vat_amount, shipping_amount, total, created_at, order_items(product_id, product_name_snapshot, unit_price, quantity, line_total, is_gift)')
      .order('created_at', { ascending: false })
    if (error) {
      setCatalogMessage(`Could not load shared orders: ${error.message}`)
      return
    }
    setOrders((data ?? []).map((row) => orderFromDatabase(row as unknown as SupabaseOrderRow, catalogProducts)))
  }

  async function refreshProductReviews(productId: number) {
    if (!supabase) return
    const { data, error } = await supabase
      .from('product_reviews')
      .select('display_name, rating, title, review_text, recommended, created_at')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
    if (error) {
      setCatalogMessage(`Could not load shared reviews: ${error.message}`)
      return
    }
    const rows = (data ?? []) as Array<{ display_name: string; rating: number; title: string; review_text: string; recommended: boolean; created_at: string }>
    setCustomerReviews((current) => ({
      ...current,
      [productId]: rows.map((row) => ({
        name: row.display_name,
        rating: row.rating,
        title: row.title,
        text: row.review_text,
        recommended: row.recommended,
        date: new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(row.created_at)),
      })),
    }))
  }

  useEffect(() => {
    if (productRoute?.productId) void refreshProductReviews(productRoute.productId)
  }, [productRoute?.productId])

  useEffect(() => {
    const database = supabase
    if (!database) return
    let active = true
    const hydrateSession = async (session: Session | null, isRecovery = false) => {
      if (!active) return
      if (!session?.user) {
        setIsAuthenticated(false)
        setIsAdmin(false)
        setAuthUserId(null)
        setAuthEmail('')
        setSavedAddresses([])
        return
      }
      const { data: profile, error } = await database
        .from('profiles')
        .select('first_name, role')
        .eq('id', session.user.id)
        .maybeSingle()
      if (!active) return
      setIsAuthenticated(true)
      setAuthUserId(session.user.id)
      setAuthEmail(session.user.email ?? '')
      setBuyerFirstName(profile?.first_name ?? '')
      setIsAdmin(profile?.role === 'admin')
      if (isRecovery || window.location.pathname === '/reset-password') setAuthPage('reset-password')
      else setAuthPage(null)
      if (error) setCatalogMessage(`Signed in, but could not load your profile: ${error.message}`)
    }
    const { data: authListener } = database.auth.onAuthStateChange((event, session) => {
      void Promise.resolve().then(() => hydrateSession(session, event === 'PASSWORD_RECOVERY'))
    })
    void database.auth.getSession().then(({ data, error }) => {
      if (error) setCatalogMessage(`Could not restore your sign-in: ${error.message}`)
      return hydrateSession(data.session)
    })
    void refreshCategories()
    void refreshCatalog()
    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !authUserId) return
    void refreshOrders()
    void (async () => {
      if (isAdmin) { setSavedAddresses([]); return }
      const { data, error } = await supabase.from('customer_addresses').select('id, label, recipient_name, phone, address_line1, address_line2, city, province, postal_code').order('created_at', { ascending: false })
      if (error) { setCatalogMessage(`Could not load saved addresses: ${error.message}`); return }
      setSavedAddresses((data ?? []).map((row) => ({ id: row.id, label: row.label, recipientName: row.recipient_name, phone: row.phone, addressLine1: row.address_line1, addressLine2: row.address_line2 ?? '', city: row.city, province: row.province, postalCode: row.postal_code ?? '' })))
    })()
  }, [authUserId, isAdmin])

  useEffect(() => {
    const database = supabase
    if (!database || !authUserId || !isAdmin) return
    void database.functions.invoke('admin-users', { body: { action: 'list' } }).then(({ data, error }) => {
      if (error || data?.error) {
        void database.from('profiles').select('id, first_name, last_name, username, role, created_at').order('created_at', { ascending: false }).then(({ data: profiles, error: profileError }) => {
          if (profileError) { setCatalogMessage(`Could not load customer accounts: ${profileError.message}`); return }
          setAdminCustomers((profiles ?? []).map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, username: row.username, role: row.role, email: '', createdAt: row.created_at })))
        })
        return
      }
      setAdminCustomers((data?.users ?? []).map((row: { id: string; first_name: string; last_name: string; username: string | null; role: 'admin' | 'buyer'; email: string; created_at: string }) => ({
        id: row.id, firstName: row.first_name, lastName: row.last_name, username: row.username, role: row.role, email: row.email, createdAt: row.created_at,
      })))
    })
  }, [authUserId, isAdmin])

  useEffect(() => {
    if (supabase || !isAuthenticated || !isAdmin) return
    try {
      setAdminCustomers(readLocalAccounts().map((account) => ({
        id: `demo:${account.email.toLowerCase()}`,
        firstName: account.firstName,
        lastName: account.lastName,
        username: account.username || null,
        role: 'buyer' as const,
        email: account.email,
        createdAt: null,
      })))
    } catch (error) {
      setAdminCustomers([])
      setCatalogMessage(error instanceof Error ? `Could not load browser accounts: ${error.message}` : 'Could not load browser accounts.')
    }
  }, [isAuthenticated, isAdmin])

  useEffect(() => {
    function syncRoute() {
      const routeAuthPage = initialAuthPage()
      setAuthPage(isAuthenticated ? routeAuthPage : routeAuthPage ?? 'login')
      setAuthEmail(new URLSearchParams(window.location.search).get('email') ?? '')
      setIsShopPage(window.location.pathname === '/shop')
      setIsSearchPage(window.location.pathname === '/search')
      setIsCartPage(window.location.pathname === '/cart')
      const organizationRoute = window.location.pathname === '/organization'
      setIsOrganizationPage(organizationRoute)
      setAudienceType(organizationRoute ? 'organization' : 'solo')
      setHasChosenAudience(false)
      setIsStockCheckPage(initialStockCheckPage())
      setIsCheckoutPage(initialCheckoutPage())
      setCheckoutStep(initialCheckoutStep())
      setAccountPage(initialAccountPage())
      setTrackingOrderId(initialTrackingOrderId())
      setProductRoute(getProductRoute())
      setProductQuantity(1)
      setSearchQuery(initialSearchQuery())
    }

    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [isAuthenticated])

  function navigateToAuth(nextPage: AuthPage, email = '') {
    const safePage = nextPage ?? (isAuthenticated ? null : 'login')
    const routePath = safePage ? `/${safePage}` : '/'
    const nextPath = email && (safePage === 'forgot-password' || safePage === 'register-success' || safePage === 'account-locked')
      ? `${routePath}?email=${encodeURIComponent(email)}`
      : routePath
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    if (email) setAuthEmail(email)
    setAuthPage(safePage)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    window.scrollTo(0, 0)
  }

function completeSignIn(email: string, firstName = '', userId?: string) {
    setIsAuthenticated(true)
    setIsAdmin(false)
    setAuthUserId(userId ?? null)
    setAuthEmail(email)
    setBuyerFirstName(firstName)
    setBuyerMenuOpen(false)
    setHasChosenAudience(false)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    setCartOpen(false)
    if (window.location.pathname !== '/') window.history.pushState({}, '', '/')
    window.scrollTo(0, 0)
  }

  function completeAdminSignIn(email: string, firstName = '', userId?: string) {
    setIsAuthenticated(true)
    setIsAdmin(true)
    setAuthUserId(userId ?? null)
    setAuthEmail(email)
    setBuyerFirstName(firstName)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage('admin')
    setAdminSection('overview')
    setTrackingOrderId('')
    setProductRoute(null)
    setCartOpen(false)
    window.history.pushState({}, '', '/admin')
    window.scrollTo(0, 0)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!query) return
    const params = new URLSearchParams({ q: query })
    window.history.pushState({}, '', `/search?${params.toString()}`)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(true)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    window.scrollTo(0, 0)
  }

  function searchForSuggestion(suggestion: string) {
    setSearchQuery(suggestion)
    const params = new URLSearchParams({ q: suggestion })
    window.history.pushState({}, '', `/search?${params.toString()}`)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(true)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    window.scrollTo(0, 0)
  }

  function navigateToShop() {
    if (window.location.pathname !== '/shop') {
      window.history.pushState({}, '', '/shop')
    }
    setAuthPage(null)
    setIsShopPage(true)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    window.scrollTo(0, 0)
  }

  function selectSidebarCategory(category: CategoryFilter) {
    setActiveCategory(category)
    setSearchQuery('')
    setMobileCategoryMenuOpen(false)
    navigateToShop()
    window.setTimeout(() => {
      document.querySelector('.shop-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function navigateToProduct(product: Product) {
    window.history.pushState({}, '', `/product/${product.id}`)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute({ productId: product.id, view: 'detail' })
    setProductQuantity(1)
    window.scrollTo(0, 0)
  }

  function navigateToProductReviews(product: Product, view: 'reviews' | 'write-review') {
    const path = `/product/${product.id}/${view === 'reviews' ? 'reviews' : 'review'}`
    window.history.pushState({}, '', path)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute({ productId: product.id, view: view === 'reviews' ? 'reviews' : 'write-review' })
    window.scrollTo(0, 0)
  }

  async function submitCustomerReview(product: Product, review: Omit<CustomerReview, 'name' | 'date'>) {
    const deliveredOrder = orders.find((order) => order.status === 'Delivered' && order.items.some((item) => item.product.id === product.id))
    if (!deliveredOrder) throw new Error('Only buyers with a delivered order can review this product.')
    if (supabase) {
      if (!deliveredOrder.databaseId) throw new Error('This delivered order is missing its database reference.')
      const { error } = await supabase.rpc('submit_product_review', {
        p_order_id: deliveredOrder.databaseId,
        p_product_id: product.id,
        p_rating: review.rating,
        p_title: review.title,
        p_review_text: review.text,
        p_recommended: review.recommended,
      })
      if (error) throw new Error(error.message)
      await refreshProductReviews(product.id)
    } else {
      setCustomerReviews((currentReviews) => ({
        ...currentReviews,
        [product.id]: [{ ...review, name: 'Verified buyer', date: formatDemoOrderDate() }, ...(currentReviews[product.id] ?? [])],
      }))
    }
    navigateToProductReviews(product, 'reviews')
  }
  function addToCart(product: Product, quantity = 1) {
    const maximum = Math.min(product.stock, product.stockWarning ? 2 : 10)
    if ((cart[product.id] ?? 0) + quantity > maximum) {
      setCartNotice({ type: 'maximum', product })
      return
    }
    setCart((currentCart) => ({
      ...currentCart,
      [product.id]: (currentCart[product.id] ?? 0) + quantity,
    }))
    setLastAddedProductId(product.id)
    showCartToast(`${product.name} added to cart.`)
  }

  function updateQuantity(productId: number, quantity: number) {
    const product = cartItems.find((item) => item.id === productId)
    if ((productId === 10 || (productId === 9 && organizationGoBagItems.length > 0)) && quantity > 0 && quantity < 20 && product) {
      setCartNotice({ type: 'minimum', product })
      return
    }
    const maxQuantity = productId === 10 || (productId === 9 && organizationGoBagItems.length > 0)
      ? 1000
      : product ? Math.min(product.stock, product.stockWarning ? 2 : 10) : 10
    if (product && quantity > maxQuantity) {
      setCartNotice({ type: 'maximum', product })
      return
    }
    if (productId === 10 && quantity <= 0) setBulkCartProduct(null)
    setCart((currentCart) => {
      const nextCart = { ...currentCart }
      if (quantity <= 0) {
        delete nextCart[productId]
      } else {
        nextCart[productId] = quantity
      }
      return nextCart
    })
  }

  function commitBulkOrder(product: Product, quantity: number) {
    setBulkCartProduct(product)
    setCart((currentCart) => ({ ...currentCart, 10: quantity }))
    setLastAddedProductId(10)
    showCartToast(`${product.name} added to cart.`)
  }

  function commitOrganizationGoBag(kitItems: Product[], quantity: number) {
    const itemIds = kitItems.map((product) => product.id)
    const kitSubtotal = kitItems.reduce((total, product) => total + product.price, 0)
    const discount = getBulkDiscount(quantity)
    setOrganizationGoBagItems(itemIds)
    setCartBundlePrice(Math.round(kitSubtotal * (1 - discount)))
    setCart((currentCart) => ({ ...currentCart, 9: quantity }))
    setLastAddedProductId(9)
    showCartToast(`${quantity} custom Go-Bags added to cart.`)
  }

  function applyAudience(audience: AudienceType, forceStorefront = false) {
    setAudienceType(audience)
    setHasChosenAudience(true)
    if (isCheckoutPage && !forceStorefront) return
    const nextPath = audience === 'organization' ? '/organization' : '/shop'
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
    setIsOrganizationPage(audience === 'organization')
    setIsShopPage(audience === 'solo')
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    setCartOpen(false)
    window.scrollTo(0, 0)
  }

  function selectAudience(audience: AudienceType) {
    const isInitialChoice = !hasChosenAudience
    if (!isInitialChoice && audience === audienceType) return
    const hasCartItems = Object.values(cart).some((quantity) => quantity > 0)
    if (!isInitialChoice && audience !== audienceType && hasCartItems) {
      setPendingModeSwitch({ audience })
      return
    }
    applyAudience(audience)
  }

  function addBulkOrder(product: Product, quantity: number) {
    if (quantity < 20 || quantity > 1000) return false
    if (audienceType !== 'organization') {
      if (Object.values(cart).some((cartQuantity) => cartQuantity > 0)) {
        setPendingModeSwitch({ audience: 'organization', bulkOrder: { product, quantity } })
        return 'pending'
      }
      applyAudience('organization')
    }
    commitBulkOrder(product, quantity)
    return true
  }

  function addOrganizationGoBag(kitItems: Product[], quantity: number) {
    if (kitItems.length === 0 || quantity < 20 || quantity > 1000) return
    if (audienceType !== 'organization') {
      if (Object.values(cart).some((cartQuantity) => cartQuantity > 0)) {
        setPendingModeSwitch({ audience: 'organization', organizationGoBag: { products: kitItems, quantity } })
        return
      }
      applyAudience('organization')
    }
    commitOrganizationGoBag(kitItems, quantity)
  }

  function confirmModeSwitch() {
    const pending = pendingModeSwitch
    if (!pending) return
    setCart({})
    setBulkCartProduct(null)
    setCartBundlePrice(0)
    setLastAddedProductId(null)
    setCartNotice(null)
    setPendingModeSwitch(null)
    applyAudience(pending.audience, true)
    if (pending.bulkOrder) commitBulkOrder(pending.bulkOrder.product, pending.bulkOrder.quantity)
    if (pending.organizationGoBag) commitOrganizationGoBag(pending.organizationGoBag.products, pending.organizationGoBag.quantity)
  }

  function requestRemoveFromCart(product: Product) {
    setCartNotice({ type: 'remove', product })
  }

  function confirmRemoveFromCart(product: Product) {
    updateQuantity(product.id, 0)
    setCartNotice(null)
  }

  function changeProductDetailQuantity(quantity: number) {
    const product = selectedProduct
    const maximum = product?.stockWarning ? 2 : 10
    if (quantity > maximum && product) {
      setCartNotice({ type: 'maximum', product })
      return
    }
    setProductQuantity(quantity)
  }

  function navigateToCart() {
    if (window.location.pathname !== '/cart') {
      window.history.pushState({}, '', '/cart')
    }
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(true)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    setCartOpen(false)
    setLastAddedProductId(null)
    window.scrollTo(0, 0)
  }

  function navigateToStockCheck() {
    window.history.pushState({}, '', '/checkout/inventory')
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(true)
    setIsCheckoutPage(false)
    setAccountPage(null)
    setProductRoute(null)
    setCartOpen(false)
    window.scrollTo(0, 0)
  }

  function navigateToCheckout(step: CheckoutStep) {
    window.history.pushState({}, '', `/checkout/${step}`)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(true)
    setCheckoutStep(step)
    setAccountPage(null)
    setProductRoute(null)
    window.scrollTo(0, 0)
  }

  function navigateToAccountPage(page: Exclude<AccountPage, null>, orderId = '') {
    const path = page === 'orders' ? '/orders'
      : page === 'track' ? '/track-order'
        : page === 'admin' ? '/admin'
          : page === 'addresses' ? '/addresses' : '/invoice'
    const nextPath = ['track', 'invoice'].includes(page) && orderId
      ? `${path}?order=${encodeURIComponent(orderId)}`
      : path
    window.history.pushState({}, '', nextPath)
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setAccountPage(page)
    setTrackingOrderId(orderId)
    setProductRoute(null)
    window.scrollTo(0, 0)
  }

  async function completeOrder(order: OrderRecord): Promise<OrderRecord> {
    if (supabase) {
      if (!authUserId) throw new Error('Sign in again before placing this order.')
      const itemQuantities = new Map<number, number>()
      let kitProductIds: number[] = []
      let kitQuantity = 0
      let kitHasFreeBag = false
      for (const item of order.items) {
        if (item.product.id === 9) {
          kitProductIds = audienceType === 'organization' && organizationGoBagItems.length > 0
            ? organizationGoBagItems
            : selectedBundleItems
          kitQuantity = item.quantity
          kitHasFreeBag = audienceType === 'solo'
          continue
        }
        const sourceProduct = item.product.id === 10 ? bulkCartProduct : item.product
        if (!sourceProduct || sourceProduct.id === 9 || sourceProduct.id === 10) {
          throw new Error('One cart item is no longer available in the shared catalog. Refresh and try again.')
        }
        itemQuantities.set(sourceProduct.id, (itemQuantities.get(sourceProduct.id) ?? 0) + item.quantity)
      }

      const items = [...itemQuantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }))
      const paymentMethod = order.paymentMethod === 'Cash on Delivery'
        ? 'cash_on_delivery'
        : order.paymentMethod.toLowerCase()
      const deliveryMethod = order.deliveryMethod === 'Priority Dispatch'
        ? 'priority_dispatch'
        : order.deliveryMethod === 'Barangay / Hub Pickup' ? 'barangay_hub_pickup' : 'standard_nationwide'
      const address = order.deliveryAddress
      if (!address?.addressLine1 || !address.city || !address.province) {
        throw new Error('Complete your street address, city, and province before placing the order.')
      }

      const { data: orderId, error } = await supabase.rpc('place_order', {
        p_items: items,
        p_order_type: audienceType === 'organization' ? 'organization' : 'retail',
        p_payment_method: paymentMethod,
        p_delivery_method: deliveryMethod,
        p_contact_name: order.contactName,
        p_phone: order.phone,
        p_address_line1: address.addressLine1,
        p_address_line2: address.addressLine2,
        p_city: address.city,
        p_province: address.province,
        p_postal_code: address.postalCode,
        p_kit_product_ids: kitProductIds,
        p_kit_quantity: kitQuantity,
        p_kit_has_free_bag: kitHasFreeBag,
      })
      if (error) throw new Error(error.message)
      const { data: savedOrder, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, status, payment_status, payment_method, delivery_method, contact_name, email, phone, address_line1, address_line2, city, province, postal_code, subtotal, vat_amount, shipping_amount, total, created_at, order_items(product_id, product_name_snapshot, unit_price, quantity, line_total, is_gift)')
        .eq('id', orderId)
        .single()
      if (orderError) throw new Error(orderError.message)
      const completedOrder = orderFromDatabase(savedOrder as unknown as SupabaseOrderRow, catalogProducts)
      setOrders((currentOrders) => [completedOrder, ...currentOrders.filter((item) => item.id !== completedOrder.id)])
      setCart({})
      await Promise.all([refreshCatalog(), refreshOrders()])
      return completedOrder
    }

    const address = order.deliveryAddress
    if (!order.contactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)
      || !/^09\d{9}$/.test(order.phone)
      || !address?.addressLine1.trim() || !address.city || !address.province
      || !order.items.length || order.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
      throw new Error('Review your contact, delivery address, and item quantities before placing the order.')
    }

    const stockChanges = new Map<number, number>()
    const reserveStock = (productId: number, quantity: number) => {
      stockChanges.set(productId, (stockChanges.get(productId) ?? 0) + quantity)
    }
    for (const item of order.items) {
      if (item.product.id === 9) {
        const kitProductIds = audienceType === 'organization' && organizationGoBagItems.length > 0
          ? organizationGoBagItems
          : selectedBundleItems
        if (kitProductIds.length < MIN_GO_BAG_ITEMS || kitProductIds.length > MAX_GO_BAG_ITEMS) {
          throw new Error(`A Go-Bag must contain ${MIN_GO_BAG_ITEMS}–${MAX_GO_BAG_ITEMS} selected products.`)
        }
        kitProductIds.forEach((productId) => reserveStock(productId, item.quantity))
        if (audienceType === 'solo') {
          const includedBag = catalogProducts.find((product) => product.isKitBag)
          if (!includedBag) throw new Error('The included Go-Bag is unavailable in the product catalog.')
          reserveStock(includedBag.id, item.quantity)
        }
      } else if (item.product.id === 10) {
        if (!bulkCartProduct) throw new Error('The bulk item is no longer available. Please refresh your cart.')
        reserveStock(bulkCartProduct.id, item.quantity)
      } else {
        reserveStock(item.product.id, item.quantity)
      }
    }

    const nextInventory = { ...inventory }
    for (const [productId, quantity] of stockChanges) {
      const product = catalogProducts.find((candidate) => candidate.id === productId)
      const available = nextInventory[productId] ?? product?.stock ?? 0
      if (!product || quantity > available) {
        throw new Error(`Not enough stock for ${product?.name ?? 'one item in your order'}. Reduce the quantity and try again.`)
      }
      nextInventory[productId] = available - quantity
    }
    setInventory(nextInventory)
    setCatalogProducts((currentProducts) => currentProducts.map((product) => {
      const stock = nextInventory[product.id] ?? product.stock
      return { ...product, stock, stockWarning: stock <= 10 }
    }))
    const demoOrder = {
      ...order,
      status: order.paymentMethod === 'Cash on Delivery' ? 'Processing' as const : 'Awaiting payment' as const,
    }
    setOrders((currentOrders) => [demoOrder, ...currentOrders])
    setCart({})
    return demoOrder
  }

  async function simulatePayment(order: OrderRecord, approved: boolean): Promise<OrderRecord> {
    if (supabase) {
      if (!order.databaseId) throw new Error('This order is missing its shared database reference.')
      const { error } = await supabase.rpc('simulate_demo_payment', {
        p_order_id: order.databaseId,
        p_approved: approved,
      })
      if (error) throw new Error(error.message)
      await refreshOrders()
      const refreshed = orders.find((candidate) => candidate.id === order.id)
      const next = { ...order, paymentStatus: approved ? 'paid' as const : 'failed' as const, status: approved ? 'Processing' as const : 'Awaiting payment' as const }
      setOrders((currentOrders) => currentOrders.map((candidate) => candidate.id === order.id ? next : candidate))
      return refreshed ? { ...refreshed, ...next } : next
    }
    const next = { ...order, paymentStatus: approved ? 'paid' as const : 'failed' as const, status: approved ? 'Processing' as const : 'Awaiting payment' as const }
    setOrders((currentOrders) => currentOrders.map((candidate) => candidate.id === order.id ? next : candidate))
    return next
  }

  async function saveAddress(address: Omit<SavedAddress, 'id'>) {
    if (supabase) {
      if (!authUserId) throw new Error('Sign in to save an address to your account.')
      const { data, error } = await supabase.from('customer_addresses').insert({
        buyer_id: authUserId,
        label: address.label,
        recipient_name: address.recipientName,
        phone: address.phone,
        address_line1: address.addressLine1,
        address_line2: address.addressLine2,
        city: address.city,
        province: address.province,
        postal_code: address.postalCode,
      }).select('id').single()
      if (error) throw new Error(error.message)
      setSavedAddresses((current) => [{ ...address, id: data.id }, ...current])
      return
    }
    setSavedAddresses((current) => [{ ...address, id: crypto.randomUUID() }, ...current])
  }

  async function deleteAddress(id: string) {
    if (supabase) {
      const { error } = await supabase.from('customer_addresses').delete().eq('id', id)
      if (error) throw new Error(error.message)
    }
    setSavedAddresses((current) => current.filter((address) => address.id !== id))
  }

  async function callAdminUsers(body: Record<string, unknown>) {
    if (!supabase) throw new Error('Shared account management is not configured.')
    const { data, error } = await supabase.functions.invoke('admin-users', { body })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function refreshAdminUsers() {
    const data = await callAdminUsers({ action: 'list' })
    setAdminCustomers((data?.users ?? []).map((row: { id: string; first_name: string; last_name: string; username: string | null; role: 'admin' | 'buyer'; email: string; created_at: string }) => ({
      id: row.id, firstName: row.first_name, lastName: row.last_name, username: row.username, role: row.role, email: row.email, createdAt: row.created_at,
    })))
  }

  async function inviteAdminUser(user: { email: string; firstName: string; lastName: string; username: string; role: 'admin' | 'buyer' }) {
    await callAdminUsers({ action: 'invite', ...user })
    await refreshAdminUsers()
  }

  async function updateAdminUser(user: AdminCustomer) {
    await callAdminUsers({ action: 'update', userId: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username, role: user.role })
    await refreshAdminUsers()
  }

  async function resetAdminUserPassword(userId: string) {
    await callAdminUsers({ action: 'send_reset', userId })
  }

  async function updateOrderStatus(orderId: string, status: OrderRecord['status']) {
    const order = orders.find((candidate) => candidate.id === orderId)
    if (supabase && order?.databaseId) {
      const databaseStatus = status.toLowerCase().replaceAll(' ', '_')
      const { error } = await supabase.from('orders').update({ status: databaseStatus }).eq('id', order.databaseId)
      if (error) {
        setCatalogMessage(`Could not update order status: ${error.message}`)
        return
      }
      void refreshOrders()
    }
    setOrders((currentOrders) => currentOrders.map((order) =>
      order.id === orderId ? { ...order, status } : order,
    ))
  }

  async function updateInventory(productId: number, quantity: number) {
    if (!Number.isFinite(quantity) || quantity < 0) return
    const nextQuantity = Math.floor(quantity)
    const product = catalogProducts.find((candidate) => candidate.id === productId)
    const currentQuantity = inventory[productId] ?? product?.stock ?? 0
    const difference = nextQuantity - currentQuantity
    if (difference === 0) return
    if (supabase) {
      const { error } = await supabase.rpc('adjust_inventory', {
        p_product_id: productId,
        p_quantity_change: difference,
        p_reason: 'admin_stock_adjustment',
        p_note: 'Adjusted in the admin inventory screen',
      })
      if (error) {
        setCatalogMessage(`Could not update stock: ${error.message}`)
        return
      }
    }
    setInventory((currentInventory) => ({ ...currentInventory, [productId]: nextQuantity }))
    setCatalogProducts((currentProducts) => currentProducts.map((item) =>
      item.id === productId ? { ...item, stock: nextQuantity, stockWarning: nextQuantity <= 10 } : item,
    ))
  }

  async function createCategory(rawName: string) {
    const name = rawName.trim()
    if (!name || name.length > 80) throw new Error('Category names must be between 1 and 80 characters.')
    if (catalogCategories.some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A category with this name already exists.')
    const slug = categorySlug(name)
    if (!slug) throw new Error('Enter a category name with at least one letter or number.')
    if (supabase) {
      const { error } = await supabase.from('categories').insert({ name, slug, display_order: catalogCategories.length - 1, is_active: true })
      if (error) throw new Error(error.message)
      await refreshCategories()
      return
    }
    setCatalogCategories((current) => [...current, name])
  }

  async function renameCategory(previousName: string, rawNextName: string) {
    const nextName = rawNextName.trim()
    if (!nextName || nextName.length > 80) throw new Error('Category names must be between 1 and 80 characters.')
    if (catalogCategories.some((category) => category !== previousName && category.toLocaleLowerCase() === nextName.toLocaleLowerCase())) throw new Error('A category with this name already exists.')
    if (supabase) {
      const { data: category, error: findError } = await supabase.from('categories').select('id').eq('name', previousName).eq('is_active', true).single()
      if (findError) throw new Error(findError.message)
      const { error } = await supabase.from('categories').update({ name: nextName, slug: categorySlug(nextName) }).eq('id', category.id)
      if (error) throw new Error(error.message)
    }
    setCatalogCategories((current) => current.map((category) => category === previousName ? nextName : category))
    setCatalogProducts((current) => current.map((product) => product.category === previousName ? { ...product, category: nextName } : product))
    setOrders((current) => current.map((order) => ({
      ...order,
      items: order.items.map((item) => item.product.category === previousName
        ? { ...item, product: { ...item.product, category: nextName } }
        : item),
    })))
  }

  async function deleteCategory(name: string) {
    if (catalogProducts.some((product) => product.category === name)) throw new Error('Move all products out of this category before removing it.')
    if (supabase) {
      const { data: category, error: findError } = await supabase.from('categories').select('id').eq('name', name).eq('is_active', true).single()
      if (findError) throw new Error(findError.message)
      const { data: assignedProducts, error: productsError } = await supabase.from('products').select('id').eq('category_id', category.id).limit(1)
      if (productsError) throw new Error(productsError.message)
      if (assignedProducts?.length) throw new Error('Move all products out of this category before removing it.')
      const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', category.id)
      if (error) throw new Error(error.message)
      await refreshCategories()
    } else {
      setCatalogCategories((current) => current.filter((category) => category !== name))
    }
    if (activeCategory === name) setActiveCategory('All items')
  }

  async function moveProductCategory(productId: number, nextCategory: string) {
    if (!catalogCategories.includes(nextCategory) || nextCategory === 'All items') throw new Error('Choose an active category.')
    if (supabase) {
      const { data: category, error: categoryError } = await supabase.from('categories').select('id').eq('name', nextCategory).eq('is_active', true).single()
      if (categoryError) throw new Error(categoryError.message)
      const { error } = await supabase.from('products').update({ category_id: category.id }).eq('id', productId)
      if (error) throw new Error(error.message)
    }
    setCatalogProducts((current) => current.map((product) => product.id === productId ? { ...product, category: nextCategory } : product))
    await refreshCatalog()
  }

  async function createProduct(input: NewProductInput) {
    if (supabase) {
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', input.category)
        .eq('is_active', true)
        .single()
      if (categoryError) throw new Error(categoryError.message)
      const sku = `ASR-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
      const { data: created, error: insertError } = await supabase
        .from('products')
        .insert({
          category_id: Number(category.id),
          sku,
          name: input.name,
          description: input.description,
          price: input.price,
          organization_minimum_quantity: 20,
          is_active: true,
        })
        .select('id')
        .single()
      if (insertError) throw new Error(insertError.message)
      if (input.stock > 0) {
        const { error: stockError } = await supabase.rpc('adjust_inventory', {
          p_product_id: Number(created.id),
          p_quantity_change: input.stock,
          p_reason: 'initial_stock',
          p_note: 'Initial stock entered with product creation',
        })
        if (stockError) throw new Error(stockError.message)
      }
      await refreshCatalog()
      return
    }

    const id = Math.max(0, ...catalogProducts.map((product) => product.id)) + 1
    const product: Product = {
      id,
      name: input.name,
      description: input.description,
      category: input.category,
      price: input.price,
      image: makeProductImage(id, input.name, input.category),
      stock: input.stock,
      stockWarning: input.stock <= 10,
      organizationDiscountPrice: Math.round(input.price * 0.95),
    }
    setCatalogProducts((currentProducts) => [...currentProducts, product])
    setInventory((currentInventory) => ({ ...currentInventory, [id]: input.stock }))
  }

  function navigateAdminSection(section: AdminSection) {
    setAdminSection(section)
    setAccountPage('admin')
    setAuthPage(null)
    setIsShopPage(false)
    setIsOrganizationPage(false)
    setIsSearchPage(false)
    setIsCartPage(false)
    setIsStockCheckPage(false)
    setIsCheckoutPage(false)
    setProductRoute(null)
    setCartOpen(false)
    if (window.location.pathname !== '/admin') window.history.pushState({}, '', '/admin')
    window.scrollTo(0, 0)
  }

  function signOutAdmin() {
    if (supabase && authUserId) void supabase.auth.signOut()
    setIsAuthenticated(false)
    setIsAdmin(false)
    setAuthUserId(null)
    setAuthPage('login')
    setAccountPage(null)
    window.history.pushState({}, '', '/login')
    window.scrollTo(0, 0)
  }

  function signOutBuyer() {
    if (supabase && authUserId) void supabase.auth.signOut()
    setIsAuthenticated(false)
    setAuthUserId(null)
    setBuyerFirstName('')
    setBuyerMenuOpen(false)
    setAuthPage('login')
    setAccountPage(null)
    window.history.pushState({}, '', '/login')
    window.scrollTo(0, 0)
  }

  function toggleBundleItem(productId: number) {
    if (selectedBundleItems.includes(productId)) {
      if (selectedBundleItems.length <= MIN_GO_BAG_ITEMS) {
        setBundleSelectionMessage(`A Go-Bag must include at least ${MIN_GO_BAG_ITEMS} items.`)
        return
      }
      setSelectedBundleItems(selectedBundleItems.filter((id) => id !== productId))
      setBundleSelectionMessage('')
      return
    }
    if (selectedBundleItems.length >= MAX_GO_BAG_ITEMS) {
      setBundleSelectionMessage(`A Go-Bag can include no more than ${MAX_GO_BAG_ITEMS} items.`)
      return
    }
    setSelectedBundleItems([...selectedBundleItems, productId])
    setBundleSelectionMessage('')
  }

  function addProductToGoBag(product: Product) {
    if (selectedBundleItems.includes(product.id)) {
      setBundleSelectionMessage(`${product.name} is already selected for your Go-Bag.`)
      return
    }
    if (selectedBundleItems.length >= MAX_GO_BAG_ITEMS) {
      setBundleSelectionMessage(`A Go-Bag can include no more than ${MAX_GO_BAG_ITEMS} items.`)
      return
    }
    setSelectedBundleItems([...selectedBundleItems, product.id])
    setBundleSelectionMessage('')
    showCartToast(`${product.name} added to your Go-Bag.`)
  }

  function addCompleteBundle() {
    if (selectedBundleItems.length < MIN_GO_BAG_ITEMS || selectedBundleItems.length > MAX_GO_BAG_ITEMS) {
      setBundleSelectionMessage(`Choose between ${MIN_GO_BAG_ITEMS} and ${MAX_GO_BAG_ITEMS} items before adding your Go-Bag.`)
      return
    }
    setCartBundlePrice(bundleTotal)
    setCart((currentCart) => ({
      ...currentCart,
      [customBundleProduct.id]: (currentCart[customBundleProduct.id] ?? 0) + 1,
    }))
    setLastAddedProductId(customBundleProduct.id)
    showCartToast('Custom Go-Bag added to cart.')
  }

  const selectedProduct = catalogProducts.find((product) => product.id === productRoute?.productId)
    ?? orders.flatMap((order) => order.items.map((item) => item.product)).find((product) => product.id === productRoute?.productId)

  if (authPage === 'login' || authPage === 'signup') {
    return (
      <AuthScreen
        key={authPage}
        page={authPage}
        onNavigate={navigateToAuth}
        initialEmail={authEmail}
        onLoginSuccess={completeSignIn}
        onAdminLogin={completeAdminSignIn}
        onGuestContinue={() => completeSignIn('')}
        databaseConfigured={supabaseConfigured}
      />
    )
  }

  if (authPage === 'forgot-password') {
    return <AuthRecoveryScreen key={authPage} email={authEmail} onNavigate={navigateToAuth} />
  }

  if (authPage === 'reset-password') {
    return <AuthPasswordUpdateScreen key={authPage} onNavigate={navigateToAuth} />
  }

  if (authPage === 'register-success' || authPage === 'account-locked') {
    return <AuthStatusScreen key={authPage} status={authPage} email={authEmail} onNavigate={navigateToAuth} />
  }

  if (accountPage === 'admin' && !isAdmin) {
    return (
      <AuthScreen
        key="admin-login"
        page="login"
        onNavigate={navigateToAuth}
        initialEmail={authEmail}
        onLoginSuccess={completeSignIn}
        onAdminLogin={completeAdminSignIn}
        onGuestContinue={() => completeSignIn('')}
        databaseConfigured={supabaseConfigured}
      />
    )
  }

  return (
    <div className="storefront">
      <div className="prepared-promo">
        <Icon name="droplet" className="promo-icon" />
        Flood season ready — Fast nationwide delivery | COD & GCash available
      </div>
      <header className="prepared-header">
        <a className="brand" href="/" aria-label="AquaShield Relief Co. home">
          <img src={aquaLogo} alt="" />
          <span>AquaShield<small>RELIEF CO.</small></span>
        </a>

        {!isAdmin && <form className="prepared-search" role="search" onSubmit={submitSearch}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            aria-label="Search emergency supplies"
            placeholder="Search life vests, first aid, radios..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
            }}
          />
        </form>}

        {isAdmin ? (
          <nav className="prepared-nav admin-header-nav" aria-label="Admin account">
            <span className="admin-header-user">Signed in as <strong>Administrator</strong></span>
            <button className="prepared-account" type="button" onClick={signOutAdmin}>Sign out</button>
          </nav>
        ) : <nav className="prepared-nav" aria-label="Account and order navigation">
          <div className="audience-mode-switcher" role="group" aria-label="Shopping mode">
            <button className={`prepared-account${audienceType === 'solo' ? ' active' : ''}`} type="button" aria-pressed={audienceType === 'solo'} onClick={() => selectAudience('solo')}>
              Solo / Family
            </button>
            <button className={`prepared-account${audienceType === 'organization' ? ' active' : ''}`} type="button" aria-pressed={audienceType === 'organization'} onClick={() => selectAudience('organization')}>
              Organization
            </button>
          </div>
          {isAuthenticated ? (
            <div className="buyer-account-menu">
              <button className="prepared-account buyer-account-button" type="button" aria-expanded={buyerMenuOpen} aria-haspopup="menu" onClick={() => setBuyerMenuOpen((open) => !open)}>
                <Icon name="user" /> {buyerFirstName || 'Account'}
              </button>
              {buyerMenuOpen && (
                <div className="buyer-account-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setBuyerMenuOpen(false); navigateToAccountPage('orders') }}>My orders</button>
                  <button type="button" role="menuitem" onClick={() => { setBuyerMenuOpen(false); navigateToAccountPage('addresses') }}>Saved addresses</button>
                  <button type="button" role="menuitem" onClick={signOutBuyer}>Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button className="prepared-account" type="button" onClick={() => navigateToAuth('login')}>
              <Icon name="user" /> Sign in
            </button>
          )}
          <a className="track-order-link" href="/track-order" onClick={(event) => { event.preventDefault(); navigateToAccountPage('track') }}><Icon name="pin" /> Track order</a>
        </nav>}

        {!isAdmin && <div className="prepared-cart">
          <button
            className="cart-button"
            type="button"
            aria-expanded={cartOpen}
            aria-label={`Shopping bag, ${cartCount} items`}
            onClick={() => setCartOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 8h14l1 12H4L5 8Z" />
              <path d="M9 9V6a3 3 0 0 1 6 0v3" />
            </svg>
            <span>Cart</span>
            <span className="cart-count">{cartCount}</span>
          </button>
        </div>}

      </header>
      <aside className={`prepared-sidebar${isAdmin ? ' admin-sidebar' : ''}`} aria-label={isAdmin ? 'Order management navigation' : 'Store navigation'}>
        <a className="sidebar-brand" href="/shop" onClick={(event) => { event.preventDefault(); setActiveCategory('All items'); navigateToShop() }}>
          <img src={aquaLogo} alt="" /><span>AQUASHIELD<small>RELIEF CO.</small></span>
        </a>
        {isAdmin ? (
          <>
            <span className="sidebar-section-label">COMPANY MANAGEMENT</span>
            <nav className="sidebar-nav admin-management-nav" aria-label="Company management">
              {([
                ['overview', '◫', 'Overview'],
                ['orders', '▤', 'Orders'],
                ['customers', '♙', 'Customers'],
                ['fulfillment', '⇢', 'Fulfillment'],
                ['inventory', '▦', 'Inventory'],
                ['categories', '▤', 'Categories'],
                ['reports', '▥', 'Reports'],
              ] as const).map(([section, icon, label]) => (
                <button className={adminSection === section && accountPage === 'admin' ? 'selected' : ''} type="button" key={section} aria-current={adminSection === section && accountPage === 'admin' ? 'page' : undefined} onClick={() => navigateAdminSection(section)}>
                  <span>{icon}</span>{label}
                  {section === 'orders' && <small>{orders.length}</small>}
                  {section === 'inventory' && <small className={lowStockProductsCount > 0 ? 'admin-sidebar-alert' : ''}>{lowStockProductsCount}</small>}
                </button>
              ))}
            </nav>
            <div className="admin-sidebar-footer">
              <span>Signed in as</span><strong>{authEmail || 'Administrator'}</strong>
              <button type="button" onClick={signOutAdmin}>Sign out</button>
            </div>
          </>
        ) : <>
        <button
          className="sidebar-category-toggle"
          type="button"
          aria-expanded={isSidebarCategoriesOpen}
          aria-controls="sidebar-category-filters"
          onClick={() => setSidebarCategoriesOpen((open) => !open)}
        >
          <span>SHOP CATEGORIES</span><span className="sidebar-category-chevron" aria-hidden="true">{isSidebarCategoriesOpen ? '−' : '+'}</span>
        </button>
        {(isSidebarCategoriesOpen || isMobileCategoryMenuOpen) && (
          <nav className={`sidebar-category-filters${isSidebarCategoriesOpen ? ' expanded' : ''}${isMobileCategoryMenuOpen ? ' mobile-open' : ''}`} id="sidebar-category-filters" aria-label="Shop categories">
            {catalogCategories.map((category) => (
              <button
                className={isShopPage && activeCategory === category ? 'selected' : ''}
                key={category}
                type="button"
                aria-pressed={isShopPage && activeCategory === category}
                onClick={() => selectSidebarCategory(category)}
              >
                {category === 'All items' ? 'Shop All' : category === 'Water Purification' ? 'Water & Hygiene' : category === 'Emergency Food' ? 'Food & Nutrition' : category === 'Emergency Power' ? 'Emergency Power' : category === 'Emergency Lighting' ? 'Emergency Lighting' : category === 'Emergency Communications' ? 'Communications' : category === 'Tools & Equipment' ? 'Tools & Accessories' : category === 'Shelter & Apparel' ? 'Shelter & Warmth' : category === 'Pets' ? 'Pets' : category === 'Infants & Children' ? 'Infants & Children' : category === 'Elderly & PWDs' ? 'Elderly & PWDs' : category === 'Barangay Bundles' ? 'Emergency Kits' : category}
              </button>
            ))}
          </nav>
        )}
        {isShopPage && <ShopFilterControls
          variant="sidebar"
          availabilityFilter={availabilityFilter}
          priceFilter={priceFilter}
          isFiltersOpen={isFiltersOpen}
          onAvailabilityChange={(value) => { setAvailabilityFilter(value); setShopPage(1) }}
          onPriceChange={(value) => { setPriceFilter(value); setShopPage(1) }}
          onToggle={() => setFiltersOpen((open) => !open)}
          onClear={() => { setAvailabilityFilter(null); setPriceFilter(null); setShopPage(1) }}
        />}
        <span className="sidebar-section-label sidebar-section-spaced">YOUR ACCOUNT</span>
        <nav className="sidebar-nav sidebar-account-nav" aria-label="Account navigation">
          <button type="button" onClick={() => { setActiveCategory('All items'); navigateToShop() }}><span>⌂</span> Home</button>
          <button className="sidebar-mobile-categories-button" type="button" aria-expanded={isMobileCategoryMenuOpen} onClick={() => { setSidebarCategoriesOpen(true); setMobileCategoryMenuOpen((open) => !open) }}><span>▦</span> Categories</button>
          <button className={accountPage === 'track' ? 'selected' : ''} type="button" onClick={() => navigateToAccountPage('track')}><span>⌖</span> Track Order</button>
          <button className={accountPage === 'orders' ? 'selected' : ''} type="button" onClick={() => navigateToAccountPage('orders')}><span>▤</span> My Orders</button>
          <button className={accountPage === 'addresses' ? 'selected' : ''} type="button" onClick={() => navigateToAccountPage('addresses')}><span>⌂</span> Saved Addresses</button>
        </nav>
        <div className="sidebar-promo"><strong>Be Ready.<br />Be Safer.<br />Be You.</strong><p>Build your emergency kit with preparedness essentials.</p><button type="button" onClick={() => { setActiveCategory('All items'); navigateToShop() }}>Start building</button></div>
        </>}
      </aside>
      {cartMessage && (
        <div className="cart-toast" role="status" aria-live="polite">
          <Icon name="check" />
          <span>{cartMessage}</span>
        </div>
      )}
      {cartOpen && (
        <CartDrawer
          catalog={catalogProducts}
          items={cartItems}
          cart={cart}
          subtotal={cartTotal}
          addedProduct={lastAddedProductId === null ? null : cartItems.find((product) => product.id === lastAddedProductId) ?? null}
          onClose={() => setCartOpen(false)}
          onViewCart={navigateToCart}
          onAddProduct={addToCart}
        />
      )}
      {cartNotice && (
        <CartNoticeModal
          notice={cartNotice}
          quantity={cart[cartNotice.product.id] ?? 1}
          onClose={() => setCartNotice(null)}
          onConfirmRemove={confirmRemoveFromCart}
        />
      )}
      {pendingModeSwitch && (
        <div className="cart-notice-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPendingModeSwitch(null)
        }}>
          <section className="cart-notice-modal mode-switch-modal" role="alertdialog" aria-modal="true" aria-labelledby="mode-switch-title">
            <h2 id="mode-switch-title">Switch shopping mode?</h2>
            <p>{pendingModeSwitch.audience === 'organization'
              ? 'Switching to Organization Mode will clear your current Solo/Family cart. Do you wish to proceed?'
              : 'Switching to Solo / Family Mode will clear your current Organization cart. Do you wish to proceed?'}</p>
            <div className="cart-notice-actions">
              <button className="cart-notice-remove" type="button" onClick={confirmModeSwitch}>Proceed &amp; Clear Cart</button>
              <button className="cart-notice-secondary" type="button" onClick={() => setPendingModeSwitch(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {isAuthenticated && !hasChosenAudience && ['/', '/organization'].includes(window.location.pathname) && (
        <AudienceModePrompt onChoose={selectAudience} />
      )}
      {accountPage === 'orders' ? (
      <OrdersPage
        orders={orders}
        onTrackOrder={(orderId) => navigateToAccountPage('track', orderId)}
        onInvoice={(orderId) => navigateToAccountPage('invoice', orderId)}
        onViewProduct={(product) => navigateToProduct(product)}
        onWriteReview={(product) => navigateToProductReviews(product, 'write-review')}
      />
      ) : accountPage === 'addresses' ? (
        <AddressBookPage addresses={savedAddresses} onSave={saveAddress} onDelete={deleteAddress} />
      ) : accountPage === 'track' ? (
        <TrackOrderPage orders={orders} initialOrderId={trackingOrderId} onViewOrders={() => navigateToAccountPage('orders')} />
      ) : accountPage === 'admin' ? (
        <AdminOrdersPage
          products={catalogProducts}
          categories={catalogCategories}
          orders={orders}
          customers={adminCustomers}
          section={adminSection}
          inventory={inventory}
          onSelectSection={navigateAdminSection}
          onUpdateInventory={updateInventory}
          onCreateProduct={createProduct}
          onCreateCategory={createCategory}
          onRenameCategory={renameCategory}
          onDeleteCategory={deleteCategory}
          onMoveProductCategory={moveProductCategory}
          onUpdateStatus={updateOrderStatus}
          onTrackOrder={(orderId) => navigateToAccountPage('track', orderId)}
          onInvoice={(orderId) => navigateToAccountPage('invoice', orderId)}
          onInviteUser={inviteAdminUser}
          onUpdateUser={updateAdminUser}
          onResetUserPassword={resetAdminUserPassword}
        />
      ) : accountPage === 'invoice' ? (
        <InvoicePage
          order={orders.find((order) => order.id === trackingOrderId)}
          onTrackOrder={(orderId) => navigateToAccountPage('track', orderId)}
          onViewOrders={() => navigateToAccountPage('orders')}
        />
      ) : isCheckoutPage ? (
        <CheckoutPage
          step={checkoutStep}
          items={cartItems}
          cart={cart}
          subtotal={cartTotal}
          audienceType={audienceType}
          onNavigate={navigateToCheckout}
          onOrderComplete={completeOrder}
          onSimulatePayment={simulatePayment}
          onViewOrders={() => navigateToAccountPage('orders')}
          onTrackOrder={() => navigateToAccountPage('track')}
          onInvoice={(orderId) => navigateToAccountPage('invoice', orderId)}
          savedAddresses={savedAddresses}
        />
      ) : isStockCheckPage ? (
        <StockCheckPage items={cartItems} cart={cart} onReturnToCart={navigateToCart} onContinue={() => navigateToCheckout('contact')} />
      ) : isCartPage ? (
        <CartPage
          items={cartItems}
          cart={cart}
          subtotal={cartTotal}
          onUpdateQuantity={updateQuantity}
          onRequestRemove={requestRemoveFromCart}
          onProceedToCheckout={navigateToStockCheck}
          onContinueShopping={navigateToShop}
        />
      ) : isOrganizationPage || (audienceType === 'organization' && !isCheckoutPage && !isCartPage && !isStockCheckPage && !accountPage) ? (
        <OrganizationCatalogPage
          products={catalogProducts}
          hasBulkOrder={Boolean(cart[10])}
          onAddOrder={addBulkOrder}
          onAddGoBag={addOrganizationGoBag}
        />
      ) : selectedProduct && productRoute?.view === 'reviews' ? (
        <CustomerReviewsPage
          product={selectedProduct}
          reviews={customerReviews[selectedProduct.id] ?? []}
          onWriteReview={() => navigateToProductReviews(selectedProduct, 'write-review')}
        />
      ) : selectedProduct && productRoute?.view === 'write-review' ? (
        <WriteReviewPage
          product={selectedProduct}
          canReview={orders.some((order) => order.status === 'Delivered' && order.items.some((item) => item.product.id === selectedProduct.id))}
          onSubmitReview={(review) => submitCustomerReview(selectedProduct, review)}
        />
      ) : selectedProduct ? (
        <ProductDetailPage
          product={selectedProduct}
          catalog={catalogProducts}
          reviews={customerReviews[selectedProduct.id] ?? []}
          quantity={productQuantity}
          onQuantityChange={changeProductDetailQuantity}
          onAddToCart={addToCart}
          onAddToGoBag={addProductToGoBag}
          onOpenProduct={navigateToProduct}
          onOpenReviews={() => navigateToProductReviews(selectedProduct, 'reviews')}
        />
      ) : isShopPage ? (
        <ShopPage
          products={catalogProducts}
          searchQuery={searchQuery}
          audienceType={audienceType}
          selectedCategory={activeCategory}
          availabilityFilter={availabilityFilter}
          priceFilter={priceFilter}
          isFiltersOpen={isFiltersOpen}
          currentPage={shopPage}
          onAvailabilityChange={(value) => { setAvailabilityFilter(value); setShopPage(1) }}
          onPriceChange={(value) => { setPriceFilter(value); setShopPage(1) }}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          onClearFilters={() => { setAvailabilityFilter(null); setPriceFilter(null); setShopPage(1) }}
          onPageChange={setShopPage}
          selectedBundleItems={selectedBundleItems}
          bundleSubtotal={bundleSubtotal}
          bundleDiscount={bundleDiscount}
          bundleTotal={bundleTotal}
          bundleSelectionMessage={bundleSelectionMessage}
          onAddToCart={addToCart}
          onOpenProduct={navigateToProduct}
          onToggleBundleItem={toggleBundleItem}
          onAddCompleteBundle={addCompleteBundle}
          cartMessage={cartMessage}
        />
      ) : isSearchPage ? (
        <SearchResultsPage
          products={catalogProducts}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSearch={submitSearch}
          onSelectSuggestion={searchForSuggestion}
          onBrowseAll={navigateToShop}
          onAddToCart={addToCart}
          onOpenProduct={navigateToProduct}
        />
      ) : (
      <main>
        <section className="prepared-hero">
          <div className="prepared-hero-copy">
            <h1>Preparedness powered by resilience — flood &amp; emergency supplies for every Filipino household.</h1>
            <p>
              Direct access to high-grade flotation gear, water purifiers, trauma
              medical packs, and off-grid communications. Fast dispatch out of
              Manila, delivered direct to your barangay.
            </p>
            <div className="prepared-hero-actions">
              <a className="prepared-primary-button" href="#products">Shop emergency kits <span aria-hidden="true">→</span></a>
              <a className="prepared-secondary-button" href="#builder">Build your Go-Bag</a>
            </div>
          </div>
        </section>

        <section className="prepared-trust-strip" aria-label="Shopping guarantees">
          <div><span className="trust-icon"><Icon name="truck" /></span><p><strong>Nationwide Delivery</strong><small>Door-to-door or Barangay pickup</small></p></div>
          <div><span className="trust-icon"><Icon name="wallet" /></span><p><strong>COD &amp; GCash</strong><small>Secure local payment options</small></p></div>
          <div><span className="trust-icon"><Icon name="building" /></span><p><strong>48-Hour Dispatch</strong><small>Packed &amp; sent in under 2 days</small></p></div>
          <div><span className="trust-icon"><Icon name="check" /></span><p><strong>Quality Guaranteed</strong><small>Commercial &amp; relief grade</small></p></div>
        </section>

        <SoloGoBagBuilder
          products={catalogProducts}
          selectedItems={selectedBundleItems}
          subtotal={bundleSubtotal}
          discount={bundleDiscount}
          total={bundleTotal}
          selectionMessage={bundleSelectionMessage}
          onToggleItem={toggleBundleItem}
          onAddBundle={addCompleteBundle}
        />

        <section className="prepared-products" id="products">
          <div className="prepared-products-heading">
            <span className="prepared-eyebrow">Disaster risk reduction supply catalog</span>
            <h2>Stay flood ready &amp; prepared</h2>
          </div>

          <div className="prepared-product-content">
            <div className="prepared-product-results">
              {visibleProducts.length > 0 ? (
                <div className="prepared-product-grid">
                  {visibleProducts.slice(0, 6).map((product) => (
                    <article
                      className="prepared-product-card"
                      key={product.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigateToProduct(product)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault()
                          navigateToProduct(product)
                        }
                      }}
                    >
                      <div className="prepared-product-image-wrap">
                        <ProductArtwork productId={product.id} productName={product.name} image={product.image} />
                        {product.stock <= 10 && <span className={`low-stock-badge${product.stock === 0 ? ' unavailable' : ''}`}>{product.stock === 0 ? 'Out of stock' : '⚠ Low stock'}</span>}
                        <button
                          className="prepared-quick-add"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            addToCart(product)
                          }}
                          aria-label={`Add ${product.name} to your bag`}
                          title="Add to cart"
                        >
                          <Icon name="cart" />
                        </button>
                      </div>
                      <div className="prepared-product-info">
                        <div className="prepared-product-meta">
                          <span>{product.category}</span>
                        </div>
                        <h3>{product.name}</h3>
                        <p>{product.description}</p>
                        <strong>{formatPrice(product.price)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="prepared-no-results">
                  <p>No gear found for “{searchQuery}”.</p>
                  <button
                    className="prepared-reset"
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setActiveCategory('All items')
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              {visibleProducts.length > 6 && (
                <button
                  className="prepared-view-more"
                  type="button"
                  onClick={navigateToShop}
                >
                  View More
                </button>
              )}
              <p className="prepared-cart-feedback" role="status" aria-live="polite">{cartMessage}</p>
            </div>
          </div>
        </section>
      </main>
      )}

      <footer className="prepared-footer" id="footer">
        <div className="prepared-footer-main">
          <div className="prepared-footer-brand">
            <a className="brand footer-brand" href="/" aria-label="AquaShield Relief Co. home">
              <img src={aquaLogo} alt="" />
              <span>AquaShield<small>RELIEF CO.</small></span>
            </a>
            <p>Providing commercial-grade flood preparedness and disaster relief supplies directly to Filipino households, families, and local government units nationwide.</p>
            <div className="social-links" aria-label="Social links"><a href="#footer">f</a><a href="#footer">𝕏</a><a href="#footer">◎</a><a href="#footer">▶</a></div>
          </div>
          <div className="footer-link-group"><h2>Shop categories</h2><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Barangay Bundles') }}>Complete Bundles</a><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Water Purification') }}>Water &amp; Sanitation</a><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Medical & First Aid') }}>Medical &amp; First Aid</a><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Safety Gear') }}>Safety &amp; Gear</a><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Emergency Power') }}>Power &amp; Comms</a></div>
          <div className="footer-link-group"><h2>Support &amp; trust</h2><a href="/track-order" onClick={(event) => { event.preventDefault(); navigateToAccountPage('track') }}>Track My Order</a><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Barangay Bundles') }}>LGU Procurements</a><a href="/shop" onClick={(event) => { event.preventDefault(); selectSidebarCategory('Emergency Power') }}>GCash &amp; COD Guide</a><a href="/orders" onClick={(event) => { event.preventDefault(); navigateToAccountPage('orders') }}>Refund Policy</a><a href="/addresses" onClick={(event) => { event.preventDefault(); navigateToAccountPage('addresses') }}>Contact Helpline</a></div>
          <div className="footer-link-group payment-group"><h2>Accepted payments</h2><span><Icon name="card" /> GCash Available</span><span><Icon name="card" /> Maya Wallet</span><span><Icon name="card" /> Cash on Delivery</span><small>All logistics and handling are fully disinfected, secure, and cleared for rapid distribution.</small></div>
        </div>
        <div className="prepared-footer-bottom">
          <span>© {currentYear} AquaShield Relief Co. Preparedness powered by resilience.</span>
          <span>HQ: Port Area, Manila, Philippines</span>
        </div>
      </footer>
    </div>
  )
}

export default App
