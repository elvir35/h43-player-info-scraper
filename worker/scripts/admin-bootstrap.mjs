import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
// Produces a private reviewable SQL file; never executes against any database.
const input=process.argv[2],output=process.argv[3];
if(!input||!output||!resolve(output).startsWith(resolve('.staging')+sep))throw new Error('Provide private input and .staging output paths');
const config=JSON.parse(await readFile(input,'utf8'));
const mail=value=>{if(typeof value!=='string'||!/^[-a-z0-9._+]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)||value.length>254)throw new Error('Invalid bootstrap email');return value.toLowerCase();};
const administrator=mail(config.administrator),coaches=config.coaches.map(c=>({email:mail(c.email),teamId:c.teamId}));
if(coaches.some(c=>c.email===administrator||!/^[a-z0-9][a-z0-9-]{0,31}$/.test(c.teamId)))throw new Error('Invalid bootstrap assignment');
const lines=[`INSERT INTO admin_users(email,role) VALUES('${administrator}','admin') ON CONFLICT(email) DO NOTHING;`];
for(const coach of coaches){lines.push(`INSERT INTO admin_users(email,role) VALUES('${coach.email}','coach') ON CONFLICT(email) DO NOTHING;`,
  `INSERT INTO admin_team_assignments(email,team_id,can_publish) SELECT '${coach.email}','${coach.teamId}',1 WHERE EXISTS(SELECT 1 FROM admin_users WHERE email='${coach.email}' AND role='coach' AND enabled=1) ON CONFLICT(email,team_id) DO NOTHING;`);}
lines.push(`INSERT INTO admin_audit(id,actor_email,action,created_at) VALUES(lower(hex(randomblob(16))),'operator','bootstrap',strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
await writeFile(output,lines.join('\n')+'\n');console.log(`Prepared bootstrap for one administrator and ${coaches.length} coach assignment(s); no database modified and no addresses printed`);
