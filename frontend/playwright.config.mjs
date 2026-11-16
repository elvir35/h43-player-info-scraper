import {createRequire} from 'node:module';
const require=createRequire(new URL('../worker/package.json',import.meta.url));
const {defineConfig}=require('@playwright/test');
const previewUrl=`http://localhost:${process.env.H43_PREVIEW_PORT||3000}`;
export default defineConfig({testDir:'./test',timeout:30000,fullyParallel:false,workers:1,reporter:'list',
  outputDir:'./test-results',use:{baseURL:process.env.H43_PREVIEW_ORIGIN||previewUrl,browserName:'chromium',viewport:{width:1440,height:1100},locale:'sv-SE',timezoneId:'America/Los_Angeles',trace:'retain-on-failure'},
  webServer:process.env.H43_PREVIEW_ORIGIN?undefined:{command:'node scripts/serve.mjs',url:previewUrl+'/preview/p11/',reuseExistingServer:process.env.H43_REUSE_PREVIEW==='1'},
});
