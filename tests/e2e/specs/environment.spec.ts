import { test, expect } from '@playwright/test'

test.describe('Environment Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Navigate to environments page
    await page.click('text=环境管理')
    await page.waitForURL('**/environments')
  })

  test('should display environments list', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('环境管理')
    
    // Should have table or list
    const listExists = await page.locator('table, [role="list"]').count() > 0
    expect(listExists).toBeTruthy()
  })

  test('should create new environment', async ({ page }) => {
    // Click create button
    await page.click('button:has-text("创建环境")')
    
    // Fill form
    const timestamp = Date.now()
    await page.fill('input[name="environment_key"]', `test-env-${timestamp}`)
    await page.fill('input[name="environment_name"]', `Test Environment ${timestamp}`)
    await page.fill('textarea[name="description"]', 'E2E Test Environment')
    
    // Submit
    await page.click('button:has-text("确定"), button:has-text("提交")')
    
    // Should see success message
    await expect(page.locator('text=成功')).toBeVisible({ timeout: 5000 })
    
    // Should see new environment in list
    await expect(page.locator(`text=test-env-${timestamp}`)).toBeVisible()
  })

  test('should edit environment', async ({ page }) => {
    // Find first edit button
    const editButton = page.locator('button:has-text("编辑")').first()
    if (await editButton.count() > 0) {
      await editButton.click()
      
      // Update name
      const nameInput = page.locator('input[name="environment_name"]')
      await nameInput.fill(`Updated ${Date.now()}`)
      
      // Submit
      await page.click('button:has-text("确定"), button:has-text("提交")')
      
      // Should see success message
      await expect(page.locator('text=成功')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should delete environment', async ({ page }) => {
    // Create a test environment first
    await page.click('button:has-text("创建环境")')
    const timestamp = Date.now()
    const envKey = `delete-test-${timestamp}`
    
    await page.fill('input[name="environment_key"]', envKey)
    await page.fill('input[name="environment_name"]', `To Delete ${timestamp}`)
    await page.click('button:has-text("确定"), button:has-text("提交")')
    await page.waitForTimeout(1000)
    
    // Find and delete it
    const row = page.locator(`tr:has-text("${envKey}")`)
    await row.locator('button:has-text("删除")').click()
    
    // Confirm deletion
    await page.click('button:has-text("确认")')
    
    // Should see success message
    await expect(page.locator('text=成功')).toBeVisible({ timeout: 5000 })
    
    // Should not see the environment anymore
    await expect(page.locator(`text=${envKey}`)).not.toBeVisible()
  })
})
