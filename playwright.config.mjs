import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',timeout:45000,workers:2,use:{viewport:{width:390,height:844},trace:'retain-on-failure'},projects:[{name:'chromium',use:{browserName:'chromium',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}},{name:'webkit',use:{browserName:'webkit'}}]});
