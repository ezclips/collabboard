// lib/collabboard/layouts/LayoutDebug.ts
import LayoutManager from './LayoutManager';
import { LayoutType } from '../types';

/**
 * Debug helper to troubleshoot layout calculation issues
 */
export class LayoutDebugger {
  /**
   * Comprehensive debug for layout calculation
   */
  static debugLayout(
    layoutType: LayoutType,
    count: number,
    containerWidth: number,
    containerHeight: number,
    existingPositions?: any[]
  ) {
    console.group(`🔍 Layout Debug: ${layoutType}`);
    
    try {
      // Check if layout is implemented
      const isImplemented = LayoutManager.isLayoutImplemented(layoutType);
      console.log(`Implementation status: ${isImplemented ? '✅ Implemented' : '❌ Not implemented'}`);
      
      // Log input parameters
      console.log('Input parameters:', {
        layoutType,
        count,
        containerWidth,
        containerHeight,
        existingPositions: existingPositions?.length || 0
      });

      // Check for common issues
      if (count < 0) {
        console.warn('⚠️ Warning: Negative item count');
      }
      
      if (containerWidth <= 0 || containerHeight <= 0) {
        console.warn('⚠️ Warning: Invalid container dimensions');
      }

      // Try to calculate positions
      const startTime = performance.now();
      const positions = LayoutManager.calculatePositions(
        layoutType,
        count,
        containerWidth,
        containerHeight,
        existingPositions
      );
      const endTime = performance.now();
      
      console.log(`⏱️ Calculation time: ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`📊 Generated ${positions.length} positions`);
      
      // Validate positions
      const validation = this.validatePositions(positions, count, containerWidth, containerHeight);
      if (validation.isValid) {
        console.log('✅ Positions are valid');
      } else {
        console.warn('❌ Position validation failed:', validation.errors);
      }
      
      // Log first few positions for inspection
      if (positions.length > 0) {
        console.log('📍 Sample positions:');
        positions.slice(0, Math.min(3, positions.length)).forEach((pos, i) => {
          console.log(`  Item ${i}:`, pos);
        });
      }
      
      return {
        success: true,
        positions,
        validation,
        performanceMs: endTime - startTime
      };
      
    } catch (error) {
      console.error('❌ Layout calculation failed:', error);
      console.error('Stack trace:', (error as Error).stack);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        positions: []
      };
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Validate position array
   */
  static validatePositions(
    positions: any[],
    expectedCount: number,
    containerWidth: number,
    containerHeight: number
  ) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check count
    if (positions.length !== expectedCount) {
      errors.push(`Expected ${expectedCount} positions, got ${positions.length}`);
    }

    // Check each position
    positions.forEach((pos, i) => {
      if (!pos || typeof pos !== 'object') {
        errors.push(`Position ${i} is not an object: ${typeof pos}`);
        return;
      }

      // Check required properties
      const requiredProps = ['x', 'y', 'width', 'height'];
      requiredProps.forEach(prop => {
        if (typeof pos[prop] !== 'number') {
          errors.push(`Position ${i}.${prop} is not a number: ${typeof pos[prop]}`);
        } else if (isNaN(pos[prop])) {
          errors.push(`Position ${i}.${prop} is NaN`);
        }
      });

      // Check for reasonable values
      if (pos.width <= 0 || pos.height <= 0) {
        errors.push(`Position ${i} has invalid dimensions: ${pos.width}x${pos.height}`);
      }

      // Check bounds (allow some overflow)
      if (pos.x < -200 || pos.y < -200) {
        warnings.push(`Position ${i} is far outside container bounds: x=${pos.x}, y=${pos.y}`);
      }

      if (pos.x > containerWidth + 200 || pos.y > containerHeight + 200) {
        warnings.push(`Position ${i} extends far beyond container: x=${pos.x}, y=${pos.y}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Quick health check for layout system
   */
  static healthCheck() {
    console.group('🏥 Layout System Health Check');
    
    const layouts: LayoutType[] = ['wall', 'columns', 'grid', 'table', 'freeform', 'timeline', 'stream', 'map'];
    const results: Record<LayoutType, boolean> = {} as any;
    
    layouts.forEach(layout => {
      try {
        const positions = LayoutManager.calculatePositions(layout, 3, 800, 600);
        const isValid = positions.length === 3 && positions.every(p => 
          typeof p.x === 'number' && typeof p.y === 'number' && 
          typeof p.width === 'number' && typeof p.height === 'number'
        );
        
        results[layout] = isValid;
        console.log(`${isValid ? '✅' : '❌'} ${layout}: ${isValid ? 'OK' : 'FAILED'}`);
      } catch (error) {
        results[layout] = false;
        console.log(`❌ ${layout}: ERROR - ${error}`);
      }
    });
    
    const healthy = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    console.log(`\n📊 Overall health: ${healthy}/${total} layouts working (${Math.round(healthy/total*100)}%)`);
    console.groupEnd();
    
    return results;
  }

  /**
   * Test layout with edge cases
   */
  static edgeCaseTest(layoutType: LayoutType) {
    console.group(`🧪 Edge Case Test: ${layoutType}`);
    
    const testCases = [
      { name: 'Zero items', count: 0, width: 800, height: 600 },
      { name: 'Single item', count: 1, width: 800, height: 600 },
      { name: 'Many items', count: 50, width: 800, height: 600 },
      { name: 'Small container', count: 5, width: 200, height: 150 },
      { name: 'Very wide container', count: 10, width: 2000, height: 300 },
      { name: 'Very tall container', count: 10, width: 300, height: 2000 },
    ];
    
    const results = testCases.map(testCase => {
      try {
        const positions = LayoutManager.calculatePositions(
          layoutType, 
          testCase.count, 
          testCase.width, 
          testCase.height
        );
        
        const validation = this.validatePositions(
          positions, 
          testCase.count, 
          testCase.width, 
          testCase.height
        );
        
        console.log(`${validation.isValid ? '✅' : '❌'} ${testCase.name}: ${validation.isValid ? 'PASS' : 'FAIL'}`);
        if (!validation.isValid) {
          console.log(`   Errors: ${validation.errors.join(', ')}`);
        }
        
        return { ...testCase, success: validation.isValid, validation };
      } catch (error) {
        console.log(`❌ ${testCase.name}: ERROR - ${error}`);
        return { ...testCase, success: false, error };
      }
    });
    
    const passed = results.filter(r => r.success).length;
    console.log(`\n📊 Edge case results: ${passed}/${results.length} passed`);
    console.groupEnd();
    
    return results;
  }

  /**
   * Memory and performance analysis
   */
  static performanceAnalysis() {
    console.group('⚡ Performance Analysis');
    
    const layouts: LayoutType[] = ['wall', 'columns', 'grid', 'table', 'freeform', 'timeline', 'stream', 'map'];
    const itemCounts = [10, 50, 100, 500];
    
    layouts.forEach(layout => {
      console.log(`\n📈 ${layout.toUpperCase()}:`);
      
      itemCounts.forEach(count => {
        const iterations = count > 100 ? 5 : 10;
        const times: number[] = [];
        
        for (let i = 0; i < iterations; i++) {
          const start = performance.now();
          try {
            LayoutManager.calculatePositions(layout, count, 1200, 800);
            times.push(performance.now() - start);
          } catch (error) {
            console.log(`  ${count} items: ERROR`);
            return;
          }
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);
        
        console.log(`  ${count} items: avg ${avgTime.toFixed(2)}ms, max ${maxTime.toFixed(2)}ms`);
      });
    });
    
    console.groupEnd();
  }

  /**
   * Interactive debug session
   */
  static interactive() {
    console.log('🔧 Interactive Layout Debugger');
    console.log('Available commands:');
    console.log('  LayoutDebugger.debugLayout(layout, count, width, height)');
    console.log('  LayoutDebugger.healthCheck()');
    console.log('  LayoutDebugger.edgeCaseTest(layout)');
    console.log('  LayoutDebugger.performanceAnalysis()');
    
    // Add to window for easy access
    if (typeof window !== 'undefined') {
      (window as any).LayoutDebugger = LayoutDebugger;
      console.log('💡 LayoutDebugger is now available globally');
    }
  }
}

/**
 * Auto-run basic health check when imported
 */
if (typeof window !== 'undefined') {
  // Only run in development
  if (process.env.NODE_ENV === 'development') {
    setTimeout(() => LayoutDebugger.healthCheck(), 100);
  }
}

export default LayoutDebugger;