-- Admin-adjustable lower bound for the public KES product-price filter.
begin;

insert into public.business_settings (setting_key, setting_value, is_public)
values ('shop.price_filter_min_kes', '0'::jsonb, true)
on conflict (setting_key) do nothing;

commit;
