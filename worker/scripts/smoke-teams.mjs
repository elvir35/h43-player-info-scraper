import {readFile} from 'node:fs/promises';
import {stagingOrigin,validateContract} from './smoke-staging.mjs';

// Operator smoke tool: staging-only, read-only, never logs names or raw JSON.
async function main(){
  const origin=stagingOrigin(process.argv[2]);
  const teams=JSON.parse(await readFile(new URL('../../config/youth-teams.json',import.meta.url),'utf8'));
  const results=[];
  for(const team of teams){
    const response=await fetch(`${origin}/api/v1/teams/${encodeURIComponent(team.id)}`,{redirect:'error',signal:AbortSignal.timeout(30000)});
    const body=await response.text();
    if(response.status!==200||!response.headers.get('Content-Type')?.includes('application/json')||Buffer.byteLength(body)>256*1024)throw new Error('Invalid response');
    const value=JSON.parse(body);validateContract(value,team.id);
    if(!value.name.trim()||value.dataStatus.roster!=='withheld'||['calendar','matches'].some(k=>!['available','empty'].includes(value.dataStatus[k])))throw new Error('Team data unavailable');
    if(response.headers.get('Cache-Control')!=='no-store')throw new Error('Roster cache policy changed');
    results.push({team:team.id,players:value.roster.players.length,coaches:value.roster.coaches.length,events:value.upcomingEvents.length,matches:value.upcomingMatches.length});
  }
  console.log(JSON.stringify({status:'passed',teams:results}));
}
main().catch(()=>{console.error('Multi-team staging smoke failed; names, credentials and raw responses suppressed');process.exitCode=1;});
