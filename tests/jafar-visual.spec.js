import { test, expect } from '@playwright/test';

test('Jafar search page interaction', async ({ page }) => {
  // Navigate to the page
  await page.goto('http://localhost:4321/jafar/');
  
  // Wait for page to be ready
  await page.waitForLoadState('networkidle');
  
  // Take initial screenshot
  await page.screenshot({ 
    path: '/Users/chad/Dropbox/Public/JS/Projects/websites/CTAI/tmp/jafar-initial-state-test.png',
    fullPage: true 
  });
  
  // Find and click the first example phrase button (Arabic text)
  const exampleButtons = page.locator('button').filter({ hasText: /[\u0600-\u06FF]/ });
  const firstButton = exampleButtons.first();
  
  await firstButton.click();
  
  // Wait for search to complete
  await page.waitForTimeout(5000);
  
  // Take screenshot of results
  await page.screenshot({ 
    path: '/Users/chad/Dropbox/Public/JS/Projects/websites/CTAI/tmp/jafar-search-results-test.png',
    fullPage: true 
  });
});
