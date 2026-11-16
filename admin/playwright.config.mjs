import {createRequire} from 'node:module';const require=createRequire(new URL('../worker/package.json',import.meta.url));const {defineConfig}=require('@playwright/test');
export default defineConfig({testDir:'./test',timeout:45000,fullyParallel:false,workers:1,reporter:'list',outputDir:'./test-results',
 use:{baseURL:'http://127.0.0.1:3001',browserName:'chromium',viewport:{width:1440,height:1100},locale:'sv-SE',trace:'retain-on-failure'},
 webServer:{command:'node scripts/dev.mjs',url:'http://127.0.0.1:3001/',timeout:90000,reuseExistingServer:!process.env.CI}});
