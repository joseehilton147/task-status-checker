import { create } from './dist/index.js';
import { initializeFocusChain } from './dist/focus-chain.js';

(async () => {
  try {
    const taskId = await create('test-owner', 'test-details');
    await initializeFocusChain(taskId, 'Test Objective');
    console.log('SUCCESS');
  } catch (e) {
    console.log('FAILED:', e.message);
  }
})();
