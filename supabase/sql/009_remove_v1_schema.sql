-- V1 schema cleanup after full V2 cutover.
-- Run this only after you confirm the app is running on V2-only code.

begin;

drop table if exists public.reconciliations cascade;
drop table if exists public.transactions cascade;
drop table if exists public.categories cascade;

commit;
