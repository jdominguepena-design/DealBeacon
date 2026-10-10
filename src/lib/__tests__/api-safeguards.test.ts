import assert from 'node:assert/strict';
import { POST as savePost } from '@/app/api/properties/[id]/save/route';
import { POST as notesPost } from '@/app/api/properties/[id]/notes/route';
import { POST as recalcPost } from '@/app/api/admin/recalculate/route';
import { POST as switchRolePost } from '@/app/api/auth/switch-role/route';
import { NextRequest } from 'next/server';
import { requireAdmin, getCurrentUser, DEMO_USERS } from '@/lib/auth';

async function runApiSafeguardsTests() {
  console.log('=== DEALBEACON STAGE 11F API SAFEGUARDS VERIFICATION ===\n');

  // Test 1: POST /api/properties/[id]/save returns HTTP 501
  {
    const req = new NextRequest('http://localhost:3000/api/properties/cmv123/save', {
      method: 'POST',
      body: JSON.stringify({ status: 'RESEARCHING' }),
    });
    const res = await savePost(req, { params: Promise.resolve({ id: 'cmv123' }) });
    const data = await res.json();

    assert.equal(res.status, 501, 'Save route must return HTTP 501 Not Implemented');
    assert.equal(data.code, 'FEATURE_DISABLED');
    assert.equal(data.success, undefined, 'Must not return success: true');
    console.log('✔ PASS: POST /api/properties/[id]/save returned HTTP 501 with FEATURE_DISABLED');
  }

  // Test 2: POST /api/properties/[id]/notes returns HTTP 501
  {
    const req = new NextRequest('http://localhost:3000/api/properties/cmv123/notes', {
      method: 'POST',
      body: JSON.stringify({ content: 'Test note' }),
    });
    const res = await notesPost(req, { params: Promise.resolve({ id: 'cmv123' }) });
    const data = await res.json();

    assert.equal(res.status, 501, 'Notes route must return HTTP 501 Not Implemented');
    assert.equal(data.code, 'FEATURE_DISABLED');
    assert.equal(data.success, undefined, 'Must not return success: true');
    console.log('✔ PASS: POST /api/properties/[id]/notes returned HTTP 501 with FEATURE_DISABLED');
  }

  // Test 3: POST /api/admin/recalculate returns HTTP 501
  {
    const res = await recalcPost();
    const data = await res.json();

    assert.equal(res.status, 501, 'Admin recalculate route must return HTTP 501 Not Implemented');
    assert.equal(data.code, 'FEATURE_DISABLED');
    assert.equal(data.success, undefined, 'Must not return success: true');
    console.log('✔ PASS: POST /api/admin/recalculate returned HTTP 501 with FEATURE_DISABLED');
  }

  // Test 4: Admin role rejected outside development (NODE_ENV !== 'development')
  {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';

      let errorThrown = false;
      try {
        await requireAdmin();
      } catch (err: any) {
        errorThrown = true;
        assert.match(err.message, /disabled outside local development/);
      }
      assert.ok(errorThrown, 'requireAdmin must reject outside local development');
      console.log('✔ PASS: requireAdmin() strictly rejected when NODE_ENV === "production"');

      // Test switch-role route blocked in production
      const req = new NextRequest('http://localhost:3000/api/auth/switch-role', {
        method: 'POST',
        body: JSON.stringify({ role: 'ADMIN' }),
      });
      const res = await switchRolePost(req);
      assert.equal(res.status, 403, 'switch-role must return HTTP 403 in non-development');
      console.log('✔ PASS: POST /api/auth/switch-role blocked with HTTP 403 outside local development');
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  }

  console.log('\n======================================================');
  console.log('ALL API SAFEGUARD & AUTHORIZATION TESTS PASSED');
  console.log('======================================================\n');
}

runApiSafeguardsTests().catch(err => {
  console.error('API safeguards test failed:', err);
  process.exit(1);
});
