with paid as materialized (
 select o.user_id, o.paid_at, round((o.amount_cny+o.fee_cny)*100)::bigint cents
 from payment_orders o
 where o.status='paid' and o.paid_at >= ($1::date::timestamp at time zone $3)
 and o.paid_at < (($2::date+1)::timestamp at time zone $3)
), daily as (
 select (paid_at at time zone $3)::date as day, sum(cents) revenue, count(*) count from paid group by 1
), ranking as (
 select u.id,u.display_name name,u.email,sum(p.cents) total,count(*) count
 from paid p join identity_users u on u.id=p.user_id
 group by u.id,u.display_name,u.email order by total desc,u.id limit 100
)
select jsonb_build_object(
 'total',coalesce((select sum(cents) from paid),0),
 'count',(select count(*) from paid),
 'today',coalesce((select sum(round((amount_cny+fee_cny)*100)::bigint) from payment_orders
 where status='paid' and paid_at >= (date_trunc('day',now() at time zone $3) at time zone $3)
 and paid_at < ((date_trunc('day',now() at time zone $3)+interval '1 day') at time zone $3)),0),
 'days',(select jsonb_agg(jsonb_build_object('day',to_char(d.day,'YYYY-MM-DD'),'revenue',coalesce(s.revenue,0),'count',coalesce(s.count,0)) order by d.day)
 from generate_series($1::date::timestamp,$2::date::timestamp,interval '1 day') d(day) left join daily s on s.day=d.day::date),
 'ranking',coalesce((select jsonb_agg(to_jsonb(r) order by total desc,id) from ranking r),'[]')
)
