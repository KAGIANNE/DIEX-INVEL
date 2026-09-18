-- Supabase advisor: la función histórica de habilitación RLS no debe ser
-- invocable desde la API pública.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end;
$$;
