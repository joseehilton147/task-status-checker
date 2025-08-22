import { create } from './dist/index.js';
import { initializeFocusChain, addFocusCheckpoint } from './dist/focus-chain.js';

(async () => {
  try {
    const taskId = await create('test-owner', 'test-details');
    await initializeFocusChain(taskId, 'Test Objective');
    
    let reinjectTriggered = false;
    for (let i = 1; i <= 5; i++) {
      const result = await addFocusCheckpoint(taskId, 'Task ' + i, 'running');
      if (i === 5 && result !== null) {
        reinjectTriggered = true;
      }
    }
    
    console.log(reinjectTriggered ? 'SUCCESS' : 'FAILED');
  } catch (e) {
    console.log('ERROR:', e.message);
  }
})();
