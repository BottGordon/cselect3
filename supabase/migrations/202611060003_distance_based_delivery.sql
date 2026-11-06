-- The destination quote is an academic estimate from the PLM campus.
-- It uses city/province coordinates and a road-distance multiplier; no live
-- courier or map-routing provider is contacted.

create function public.estimated_delivery_distance_km(p_city text, p_province text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lon double precision;
  v_city text := regexp_replace(lower(trim(coalesce(p_city, ''))), ' city$', '');
  v_province text := lower(trim(coalesce(p_province, '')));
  v_delta_lat double precision;
  v_delta_lon double precision;
  v_a double precision;
  v_distance double precision;
begin
  select point.lat, point.lon into v_lat, v_lon
  from (values
    ('manila',14.5995,120.9842),('makati',14.5547,121.0244),('quezon city',14.6760,121.0437),
    ('pasig',14.5764,121.0851),('taguig',14.5176,121.0509),('mandaluyong',14.5794,121.0359),
    ('parañaque',14.4793,121.0198),('pasay',14.5378,120.9925),('caloocan',14.6570,120.9830),
    ('marikina',14.6507,121.1029),('muntinlupa',14.4081,121.0415),('las piñas',14.4445,120.9939),
    ('valenzuela',14.7011,120.9830),('san juan',14.6019,121.0355),('malabon',14.6620,120.9570),
    ('navotas',14.6590,120.9470),('pateros',14.5453,121.0683),('antipolo',14.5869,121.1763),
    ('angeles',15.1450,120.5887),('baguio',16.4023,120.5960),('olongapo',14.8294,120.2820),
    ('san fernando',15.0343,120.6844),('tarlac',15.4755,120.5963),('dagupan',16.0430,120.3330),
    ('laoag',18.1988,120.5936),('tuguegarao',17.6132,121.7269),('batangas',13.7565,121.0583),
    ('lipa',13.9411,121.1631),('calamba',14.2117,121.1653),('lucena',13.9411,121.6234),
    ('puerto princesa',9.7392,118.7353),('calapan',13.4117,121.1803),('legazpi',13.1391,123.7438),
    ('naga',13.6218,123.1948),('iloilo',10.7202,122.5621),('bacolod',10.6765,122.9509),
    ('cebu',10.3157,123.8854),('mandaue',10.3236,123.9222),('tagbilaran',9.6474,123.8552),
    ('tacloban',11.2445,125.0030),('ormoc',11.0064,124.6075),('butuan',8.9475,125.5406),
    ('cagayan de oro',8.4542,124.6319),('davao',7.1907,125.4553),('general santos',6.1164,125.1716),
    ('zamboanga',6.9214,122.0790),('cotabato',7.2236,124.2464),('dipolog',8.5880,123.3409),
    ('surigao',9.7870,125.4950),('marawi',8.0034,124.2839),('iligan',8.2280,124.2452)
  ) as point(name, lat, lon)
  where v_city = point.name
     or v_city = point.name || ' city'
     or (v_city = 'general santos city' and point.name = 'general santos')
  limit 1;

  if v_lat is null then
    select point.lat, point.lon into v_lat, v_lon
    from (values
      ('ncr',14.5896,120.9787),('bulacan',14.8430,120.8110),('pampanga',15.1450,120.5887),
      ('bataan',14.6417,120.4818),('zambales',14.8294,120.2820),('tarlac',15.4755,120.5963),
      ('pangasinan',16.0430,120.3330),('ilocos norte',18.1988,120.5936),('cagayan',17.6132,121.7269),
      ('isabela',16.9754,121.8107),('ilocos sur',17.5747,120.3869),('la union',16.6159,120.3200),
      ('nueva vizcaya',16.3301,121.1710),('quirino',16.2704,121.5370),('abra',16.4023,120.5960),
      ('apayao',17.6132,121.7269),('benguet',16.4023,120.5960),('ifugao',16.4023,120.5960),
      ('kalinga',17.6132,121.7269),('mountain province',16.4023,120.5960),('batanes',20.4485,121.9702),
      ('aurora',15.7690,121.5610),('nueva ecija',15.5784,120.9720),('cavite',14.2456,120.8786),('laguna',14.2117,121.1653),
      ('batangas',13.7565,121.0583),('quezon',13.9411,121.6234),('rizal',14.5869,121.1763),
      ('marinduque',13.4767,121.9032),('occidental mindoro',13.4117,120.9360),
      ('palawan',9.7392,118.7353),('oriental mindoro',13.4117,121.1803),('romblon',12.5781,122.2708),
      ('albay',13.1391,123.7438),('camarines norte',13.6218,123.1948),('camarines sur',13.6218,123.1948),
      ('catanduanes',13.5850,124.2370),('masbate',12.3667,123.6167),('sorsogon',12.9739,124.0050),
      ('aklan',11.7068,122.3640),('antique',11.1094,122.0930),('capiz',11.5529,122.7407),
      ('guimaras',10.7202,122.5621),('iloilo',10.7202,122.5621),('negros occidental',10.6765,122.9509),
      ('bohol',9.6474,123.8552),('cebu',10.3157,123.8854),('negros oriental',9.3068,123.3054),('siquijor',9.1999,123.5952),
      ('biliran',11.5742,124.4760),('eastern samar',11.6653,125.4360),('leyte',11.2445,125.0030),
      ('northern samar',12.2685,124.5910),('samar',11.7728,125.0190),('southern leyte',10.3346,125.1706),
      ('zamboanga del norte',8.5880,123.3409),('zamboanga del sur',6.9214,122.0790),('zamboanga sibugay',6.9214,122.0790),
      ('bukidnon',8.0515,124.9229),('camiguin',9.1732,124.7299),('lanao del norte',8.2280,124.2452),
      ('misamis occidental',8.5880,123.3409),('misamis oriental',8.4542,124.6319),('davao de oro',7.1907,125.4553),
      ('davao del norte',7.1907,125.4553),('davao del sur',7.1907,125.4553),('davao occidental',7.1907,125.4553),
      ('davao oriental',7.1907,125.4553),('cotabato',7.2236,124.2464),('sarangani',6.1164,125.1716),
      ('south cotabato',6.1164,125.1716),('sultan kudarat',7.2236,124.2464),('agusan del norte',8.9475,125.5406),
      ('agusan del sur',8.9475,125.5406),('dinagat islands',9.7870,125.4950),('surigao del norte',9.7870,125.4950),
      ('surigao del sur',9.7870,125.4950),('basilan',6.9214,122.0790),('lanao del sur',8.0034,124.2839),
      ('maguindanao del norte',7.2236,124.2464),('maguindanao del sur',7.2236,124.2464),('tawi-tawi',5.0320,119.7730)
    ) as point(name, lat, lon)
    where v_province = point.name
    limit 1;
  end if;

  if v_lat is null or v_lon is null then
    raise exception 'We cannot estimate delivery distance for this destination yet.' using errcode = '22023';
  end if;

  v_delta_lat := radians(v_lat - 14.5896);
  v_delta_lon := radians(v_lon - 120.9787);
  v_a := sin(v_delta_lat / 2) ^ 2
    + cos(radians(14.5896)) * cos(radians(v_lat)) * sin(v_delta_lon / 2) ^ 2;
  v_distance := 6371 * 2 * asin(sqrt(least(1, v_a)));
  return greatest(1, ceil(v_distance * 1.3)::integer);
end;
$$;

create function public.estimated_delivery_fee(
  p_method public.delivery_method,
  p_city text,
  p_province text
)
returns numeric(12,2)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_km integer;
  v_fee numeric(12,2);
begin
  if p_method = 'barangay_hub_pickup'::public.delivery_method then return 0; end if;
  v_km := public.estimated_delivery_distance_km(p_city, p_province);
  v_fee := case
    when v_km <= 25 then 99
    when v_km <= 50 then 149
    when v_km <= 100 then 219
    when v_km <= 250 then 349
    when v_km <= 500 then 499
    when v_km <= 1000 then 699
    else 899
  end;
  if p_method = 'priority_dispatch'::public.delivery_method then v_fee := v_fee + 100; end if;
  return v_fee;
end;
$$;

create function public.apply_estimated_delivery_fee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.shipping_amount := public.estimated_delivery_fee(new.delivery_method, new.city, new.province);
  new.total := new.subtotal + new.vat_amount + new.shipping_amount;
  return new;
end;
$$;

create trigger orders_apply_estimated_delivery_fee
  before insert or update on public.orders
  for each row execute function public.apply_estimated_delivery_fee();

revoke all on function public.estimated_delivery_distance_km(text, text) from public;
revoke all on function public.estimated_delivery_fee(public.delivery_method, text, text) from public;
grant execute on function public.estimated_delivery_distance_km(text, text) to authenticated;
grant execute on function public.estimated_delivery_fee(public.delivery_method, text, text) to authenticated;
