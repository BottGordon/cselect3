-- Support the remaining academic requirements without accepting real payments.

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text not null default '',
  city text not null,
  province text not null,
  postal_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_label_not_blank check (length(trim(label)) > 0),
  constraint customer_addresses_recipient_not_blank check (length(trim(recipient_name)) > 0),
  constraint customer_addresses_phone_not_blank check (length(trim(phone)) > 0),
  constraint customer_addresses_line1_not_blank check (length(trim(address_line1)) > 0),
  constraint customer_addresses_city_not_blank check (length(trim(city)) > 0),
  constraint customer_addresses_province_not_blank check (length(trim(province)) > 0)
);

create index customer_addresses_buyer_created_idx
  on public.customer_addresses (buyer_id, created_at desc);
create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  method public.payment_method not null,
  status public.payment_status not null,
  amount numeric(12, 2) not null check (amount >= 0),
  simulated boolean not null default true,
  reference_code text not null unique,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index payments_order_created_idx on public.payments (order_id, created_at desc);
create index payments_buyer_created_idx on public.payments (buyer_id, created_at desc);

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  rating integer not null check (rating between 1 and 5),
  title text not null check (length(trim(title)) between 3 and 120),
  review_text text not null check (length(trim(review_text)) between 10 and 2000),
  recommended boolean not null default true,
  is_approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_one_per_order unique (product_id, order_id, buyer_id)
);

create index product_reviews_product_approved_created_idx
  on public.product_reviews (product_id, is_approved, created_at desc);
create trigger product_reviews_set_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

create function public.simulate_demo_payment(p_order_id uuid, p_approved boolean)
returns table(payment_id uuid, payment_status public.payment_status, order_status public.order_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_payment_status public.payment_status;
  v_order_status public.order_status;
begin
  if v_buyer_id is null then
    raise exception 'Sign in before simulating a payment.' using errcode = '28000';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and buyer_id = v_buyer_id
  for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_method not in ('gcash'::public.payment_method, 'maya'::public.payment_method)
    or v_order.status <> 'awaiting_payment'::public.order_status
    or v_order.payment_status not in ('pending'::public.payment_status, 'failed'::public.payment_status) then
    raise exception 'This order is not eligible for demo wallet payment.' using errcode = '22023';
  end if;

  v_payment_status := case when p_approved then 'paid'::public.payment_status else 'failed'::public.payment_status end;
  v_order_status := case when p_approved then 'processing'::public.order_status else v_order.status end;

  insert into public.payments (
    id, order_id, buyer_id, method, status, amount, simulated, reference_code, note
  ) values (
    v_payment_id, v_order.id, v_buyer_id, v_order.payment_method, v_payment_status,
    v_order.total, true, 'DEMO-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 10)),
    case when p_approved then 'Demo payment approved' else 'Demo payment declined' end
  );

  update public.orders
  set payment_status = v_payment_status, status = v_order_status
  where id = v_order.id;

  return query select v_payment_id, v_payment_status, v_order_status;
end;
$$;

create function public.submit_product_review(
  p_order_id uuid,
  p_product_id bigint,
  p_rating integer,
  p_title text,
  p_review_text text,
  p_recommended boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer_id uuid := (select auth.uid());
  v_display_name text;
  v_review_id uuid := gen_random_uuid();
begin
  if v_buyer_id is null then
    raise exception 'Sign in before writing a review.' using errcode = '28000';
  end if;
  if p_rating not between 1 and 5
    or length(trim(coalesce(p_title, ''))) not between 3 and 120
    or length(trim(coalesce(p_review_text, ''))) not between 10 and 2000 then
    raise exception 'Enter a rating, a short title, and a review of at least 10 characters.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.orders as order_row
    join public.order_items as order_item on order_item.order_id = order_row.id
    where order_row.id = p_order_id
      and order_row.buyer_id = v_buyer_id
      and order_row.status = 'delivered'::public.order_status
      and order_item.product_id = p_product_id
  ) then
    raise exception 'Reviews are available after the product has been delivered.' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(first_name), ''), 'AquaShield customer')
  into v_display_name
  from public.profiles where id = v_buyer_id;

  insert into public.product_reviews (
    id, product_id, order_id, buyer_id, display_name, rating, title, review_text, recommended
  ) values (
    v_review_id, p_product_id, p_order_id, v_buyer_id, v_display_name,
    p_rating, trim(p_title), trim(p_review_text), coalesce(p_recommended, true)
  );
  return v_review_id;
end;
$$;

revoke all on function public.simulate_demo_payment(uuid, boolean) from public;
grant execute on function public.simulate_demo_payment(uuid, boolean) to authenticated;
revoke all on function public.submit_product_review(uuid, bigint, integer, text, text, boolean) from public;
grant execute on function public.submit_product_review(uuid, bigint, integer, text, text, boolean) to authenticated;

alter table public.customer_addresses enable row level security;
alter table public.payments enable row level security;
alter table public.product_reviews enable row level security;

create policy "Buyers manage their saved addresses"
  on public.customer_addresses for all to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_admin()))
  with check (buyer_id = (select auth.uid()) or (select public.is_admin()));

create policy "Buyers read their payments and admins read all"
  on public.payments for select to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_admin()));

create policy "Public can read approved reviews and buyers can read their own"
  on public.product_reviews for select to anon, authenticated
  using (is_approved or buyer_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins moderate reviews"
  on public.product_reviews for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins delete reviews"
  on public.product_reviews for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.customer_addresses, public.payments, public.product_reviews from anon, authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select on public.payments to authenticated;
grant select on public.product_reviews to anon, authenticated;
grant update (is_approved) on public.product_reviews to authenticated;
grant delete on public.product_reviews to authenticated;
grant usage, select on all sequences in schema public to authenticated;
