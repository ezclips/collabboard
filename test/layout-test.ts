// test/layout-test.ts
import LayoutManager from '../lib/collabboard/layouts/LayoutManager';
import { LayoutType } from '../lib/collabboard/types';

/**
 * Test all layout implementations
 */
export function testAllLayouts() {
  const layouts: LayoutType[] = ['wall', 'columns', 'grid', 'table', 'freeform', 'timeline', 'stream', 'map'];
  const testResults: { layout: LayoutType; success: boolean; error?: string }[] = [];

  const containerWidth = 1200;
  const containerHeight = 800;
  const itemCount = 6;

  layouts.forEach(layout => {
    try {
      console.log(`Testing ${layout} layout...`);
      
      const positions = LayoutManager.calculatePositions(
        layout,
        itemCount,
        containerWidth,
        containerHeight
      );

      // Validate results
      const isValid = validateLayoutPositions(positions, itemCount, containerWidth, containerHeight);
      
      if (isValid) {
        console.log(`✅ ${layout} layout: PASSED`);
        testResults.push({ layout, success: true });
      } else {
        console.log(`❌ ${layout} layout: FAILED - Invalid positions`);
        testResults.push({ layout, success: false, error: 'Invalid positions' });
      }
      
    } catch (error) {
      console.log(`❌ ${layout} layout: ERROR - ${error}`);
      testResults.push({ 
        layout, 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return testResults;
}

/**
 * Validate that layout positions are reasonable
 */
function validateLayoutPositions(
  positions: any[],
  expectedCount: number,
  containerWidth: number,
  containerHeight: number
): boolean {
  // Check count
  if (positions.length !== expectedCount) {
    console.log(`Expected ${expectedCount} positions, got ${positions.length}`);
    return false;
  }

  // Check each position
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    
    // Check required properties
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || 
        typeof pos.width !== 'number' || typeof pos.height !== 'number') {
      console.log(`Position ${i} missing required properties:`, pos);
      return false;
    }

    // Check bounds (allow some overflow for certain layouts)
    if (pos.x < -100 || pos.y < -100) {
      console.log(`Position ${i} has negative coordinates:`, pos);
      return false;
    }

    if (pos.width <= 0 || pos.height <= 0) {
      console.log(`Position ${i} has invalid dimensions:`, pos);
      return false;
    }

    // Check for NaN values
    if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.width) || isNaN(pos.height)) {
      console.log(`Position ${i} has NaN values:`, pos);
      return false;
    }
  }

  return true;
}

/**
 * Generate test report
 */
export function generateTestReport() {
  const results = testAllLayouts();
  const passedCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  console.log('\n📊 LAYOUT TEST REPORT');
  console.log('='.repeat(50));
  console.log(`Total layouts tested: ${totalCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${totalCount - passedCount}`);
  console.log(`Success rate: ${Math.round((passedCount / totalCount) * 100)}%`);

  console.log('\n📋 DETAILED RESULTS:');
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const error = result.error ? ` (${result.error})` : '';
    console.log(`${status} ${result.layout}${error}`);
  });

  console.log('\n🔧 LAYOUT IMPLEMENTATION STATUS:');
  results.forEach(result => {
    const implemented = LayoutManager.isLayoutImplemented(result.layout);
    const status = implemented ? '✅' : '⚠️';
    console.log(`${status} ${result.layout}: ${implemented ? 'Implemented' : 'Not implemented'}`);
  });

  return results;
}

/**
 * Test specific layout with custom parameters
 */
export function testLayout(
  layout: LayoutType, 
  itemCount: number = 5, 
  width: number = 1200, 
  height: number = 800
) {
  console.log(`\n🧪 Testing ${layout} layout with ${itemCount} items (${width}x${height})`);
  
  try {
    const positions = LayoutManager.calculatePositions(layout, itemCount, width, height);
    
    console.log('Generated positions:');
    positions.forEach((pos, i) => {
      console.log(`  Item ${i}: x=${pos.x}, y=${pos.y}, w=${pos.width}, h=${pos.height}`);
    });

    const isValid = validateLayoutPositions(positions, itemCount, width, height);
    console.log(`Validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    return { success: isValid, positions };
  } catch (error) {
    console.log(`❌ Error: ${error}`);
    return { success: false, error };
  }
}

/**
 * Performance test for layout calculations
 */
export function performanceTest() {
  console.log('\n⚡ PERFORMANCE TEST');
  console.log('='.repeat(30));
  
  const layouts: LayoutType[] = ['wall', 'columns', 'grid', 'table', 'freeform', 'timeline', 'stream', 'map'];
  const itemCounts = [10, 50, 100];
  
  layouts.forEach(layout => {
    console.log(`\n${layout.toUpperCase()} Layout:`);
    
    itemCounts.forEach(count => {
      const startTime = performance.now();
      
      try {
        LayoutManager.calculatePositions(layout, count, 1200, 800);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        console.log(`  ${count} items: ${duration.toFixed(2)}ms`);
      } catch (error) {
        console.log(`  ${count} items: ERROR`);
      }
    });
  });
}

// Export for use in browser console or test files
if (typeof window !== 'undefined') {
  (window as any).layoutTest = {
    testAllLayouts,
    generateTestReport,
    testLayout,
    performanceTest
  };
}