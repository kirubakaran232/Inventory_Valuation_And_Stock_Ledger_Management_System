import { chromium, expect } from '@playwright/test';
const base=process.env.APP_URL||'http://127.0.0.1:5174';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
const sku=`UI-CHECK-${Date.now()}`;
try {
 await page.goto(base);
 await expect(page.getByRole('button',{name:'Item settings',exact:true})).toBeVisible();
 await expect(page.locator('.metrics article').first().locator('strong')).not.toHaveText('—');
 await page.locator('aside').getByRole('button',{name:'master data',exact:true}).click();
 await page.getByLabel('SKU',{exact:true}).fill(sku);
 await page.getByLabel('Name',{exact:true}).fill('Browser verification item');
 await page.getByLabel('Item type',{exact:true}).selectOption('FINISHED_GOOD');
 await page.getByLabel('Base unit',{exact:true}).fill('unit');
 await page.getByLabel('Valuation method',{exact:true}).selectOption('WAC');
 await page.getByRole('button',{name:'Create record',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:sku});
 await expect(row).toContainText('WAC');
 await row.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Browser verification edited');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(row).toContainText('Browser verification edited');
 await row.getByRole('button',{name:'Delete',exact:true}).click();
 await expect(row).toHaveCount(0);
 await page.getByRole('button',{name:'warehouses',exact:true}).click();
 await page.getByLabel('Code',{exact:true}).fill(sku);
 await page.getByLabel('Name',{exact:true}).fill('Temporary UI warehouse');
 await page.getByRole('button',{name:'Create record',exact:true}).click();
 const warehouseRow=page.getByRole('row').filter({hasText:sku});
 await expect(warehouseRow).toContainText('Temporary UI warehouse');
 await warehouseRow.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Edited UI warehouse');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(warehouseRow).toContainText('Edited UI warehouse');
 await warehouseRow.getByRole('button',{name:'Delete',exact:true}).click();
 await expect(warehouseRow).toHaveCount(0);
 await page.locator('aside').getByRole('button',{name:'ledger',exact:true}).click();
 await page.getByLabel('As of',{exact:true}).fill('2026-10-31');
 const response=await page.request.get(base+'/api/v1/reports/valuation?asOf=2026-10-31');
 const report=await response.json();
 for(const [button,key] of [['Item settings','item'],['FIFO','fifo'],['Weighted average','wac']]) {
   await page.getByRole('button',{name:button,exact:true}).click();
   await expect(page.locator('.metrics article').nth(0).locator('strong')).toHaveText(report[key].closingValue);
   await expect(page.locator('.metrics article').nth(1).locator('strong')).toHaveText(report[key].cogs);
   await expect(page.locator('.metrics article').nth(2).locator('strong')).toHaveText(report[key].writeOffs);
   await expect(page.locator('.metrics article').nth(3).locator('strong')).toHaveText(report[key].workInProgress);
 }
 await page.locator('aside').getByRole('button',{name:'movements',exact:true}).click();
 await expect(page.getByLabel('Movement',{exact:true})).toBeVisible();
 await page.getByLabel('Movement',{exact:true}).selectOption('TRANSFER');
 await expect(page.getByLabel('Destination',{exact:true})).toBeVisible();
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Browser checks passed: item and warehouse CRUD, valuation switching, all finance totals match API, stock movement controls, no uncaught browser errors.');
} finally {
 // Only delete this run's unused verification masters if a browser assertion failed.
 for(const type of ['items','warehouses']){
   const res=await page.request.get(base+'/api/v1/'+type);
   if(res.ok())for(const record of await res.json())if((record.sku||record.code)===sku)await page.request.delete(base+'/api/v1/'+type+'/'+record._id);
 }
 await browser.close();
}
