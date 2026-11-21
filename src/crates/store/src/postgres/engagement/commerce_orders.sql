select coalesce(jsonb_agg(v order by created desc),'[]') from (
 select o.created_at created,jsonb_build_object('id',o.id,'number',o.id,'user',u.display_name,'email',u.email,
 'type','balance','plan','','credited',round(o.credit_usd*100)::bigint,'paid',round((o.amount_cny+o.fee_cny)*100)::bigint,
 'fee',round(o.fee_cny*100)::bigint,'currency','CNY','method','alipay','status',case when o.status in('failed','expired') or (o.status='pending' and o.expires_at<=now()) then 'cancelled' else o.status end,
 'created',o.created_at,'settled',o.paid_at) v
 from payment_orders o join identity_users u on u.id=o.user_id where ($1::uuid is null or o.user_id=$1) and ($2::uuid[] is null or o.id=any($2))
 union all
 select p.created_at,jsonb_build_object('id',p.id,'number',p.id,'user',u.display_name,'email',u.email,
 'type','plan','plan',s.plan->>'name','credited',0,'paid',round(p.amount_usd*100)::bigint,
 'fee',0,'subscriptionId',s.id,'currency','USD','method','wallet','status','paid','created',p.created_at,'settled',p.created_at)
 from commerce_purchases p join identity_users u on u.id=p.user_id join commerce_subscriptions s on s.id=p.subscription_id
 where ($1::uuid is null or p.user_id=$1) and ($2::uuid[] is null or p.id=any($2))
) orders
