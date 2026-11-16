import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
export function validateBuildTarget(configuration,production=false){
  const keys=['environment','apiBaseUrl','clubCalendarUrl','clubContactUrl','registrationUrl'];
  if(Object.keys(configuration).some(k=>!keys.includes(k))||keys.some(k=>typeof configuration[k]!=='string'))throw new Error('Unexpected public configuration fields');
  const api=new URL(configuration.apiBaseUrl);
  if(api.protocol!=='https:'||api.username||api.password||api.port||api.search||api.hash||api.pathname!=='/api/v1')throw new Error('Expected HTTPS API origin');
  const environment=production?'production':'staging';
  if(configuration.environment!==environment||!new RegExp('^h43-youth-api-'+environment+'\\.[a-z0-9-]+\\.workers\\.dev$').test(api.hostname))throw new Error('Build configuration does not match environment');
  for(const key of keys.slice(2)){const url=new URL(configuration[key]);if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('Invalid public club URL');}
  return {configuration,environment,dist:production?'dist-production':'dist',build:production?'.build-production':'.build',releases:production?'releases-production':'releases'};
}
export async function loadBuildTarget(root,args=process.argv.slice(2)){
  const index=args.indexOf('--production-config'),production=index!==-1;
  if(production&&(!args[index+1]||args[index+1].startsWith('--')))throw new Error('Production configuration file required');
  const file=production?resolve(args[index+1]):root+'config/staging.json';
  return validateBuildTarget(JSON.parse(await readFile(file,'utf8')),production);
}
