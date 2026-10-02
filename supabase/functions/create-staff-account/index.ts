
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const cors = {"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token) return json({error:"Sign in as an administrator."},401);
  const client = createClient(Deno.env.get("SUPABASE_URL"),Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError} = await client.auth.getUser(token);
  if(authError || !identity.user) return json({error:"Your session is invalid. Sign in again."},401);
  const {data:actor,error:profileError} = await client.from("profiles").select("role").eq("id",identity.user.id).single();
  if(profileError || actor?.role!=="admin") return json({error:"Only administrators can create staff accounts."},403);
  let body;
  try { body = await req.json(); } catch { return json({error:"Invalid request."},400); }
  if(!body || typeof body!=="object" || Array.isArray(body)) return json({error:"Invalid request."},400);
  const {email,password,full_name,role,department} = body;
  if(typeof email!=="string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
     typeof password!=="string" || password.length<6 || typeof full_name!=="string" || !full_name.trim() ||
     !["staff","admin"].includes(role) || (role==="staff" && !["it","registrar","finance"].includes(department))) {
    return json({error:"Enter a valid name, email, password, role, and staff department."},400);
  }
  // Only create a NEW account. Existing students are never promoted.
  const {data:created,error:createError} = await client.auth.admin.createUser({
    email:email.trim(),password,email_confirm:true,user_metadata:{full_name:full_name.trim()},
    app_metadata:{created_by_admin:identity.user.id}
  });
  if(createError || !created.user) return json({error:createError?.message || "Could not create account."},400);
  const {data:updated,error:updateError} = await client.from("profiles").update({role,department:role==="staff"?department:null}).eq("id",created.user.id).select("id").single();
  if(updateError || !updated) {
    // Roll back only the new account created above; never delete an existing user.
    await client.auth.admin.deleteUser(created.user.id);
    return json({error:"Account setup failed. Please try again."},500);
  }
  return json({id:created.user.id},201);
});
