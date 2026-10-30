import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { location: new URL('http://localhost/app.html') };
const { state } = await import('../js/core/state.js');
const { canReadTicket, canManageTicket, ticketDepartment, departmentLabel } = await import('../js/core/permissions.js');
const { escapeHtml } = await import('../js/ui/helpers.js');
const ticket = { id: 1, student_id: 'student-1', department: 'it', status: 'Open', assigned_to: null };

test('students read their own requests and do not manage support actions', () => {
  state.currentUser = { id: 'student-1', role: 'student' };
  assert.equal(canReadTicket(ticket), true);
  assert.equal(canReadTicket({ ...ticket, student_id: 'someone-else' }), false);
  assert.equal(canManageTicket(ticket), false);
  assert.equal(canReadTicket({ ...ticket, status: 'Closed' }), true);
});

test('staff read their department and manage only available or own active tickets', () => {
  state.currentUser = { id: 'it-1', role: 'staff', department: 'it' };
  assert.equal(canReadTicket(ticket), true);
  assert.equal(canReadTicket({ ...ticket, department: 'finance' }), false);
  assert.equal(canReadTicket({ ...ticket, assigned_to: 'it-2' }), true);
  assert.equal(canManageTicket(ticket), true);
  assert.equal(canManageTicket({ ...ticket, assigned_to: 'it-1' }), true);
  assert.equal(canManageTicket({ ...ticket, assigned_to: 'it-2' }), false);
  assert.equal(canManageTicket({ ...ticket, status: 'Resolved' }), false);
  state.currentUser.department = null;
  assert.equal(Boolean(canReadTicket(ticket)), false);
});

test('admins see all departments and completed requests remain read only', () => {
  state.currentUser = { id: 'admin-1', role: 'admin' };
  assert.equal(canReadTicket({ ...ticket, department: 'finance' }), true);
  assert.equal(canManageTicket({ ...ticket, assigned_to: 'it-2' }), true);
  assert.equal(canManageTicket({ ...ticket, status: 'Closed' }), false);
  state.currentUser = null;
  assert.equal(Boolean(canReadTicket(ticket)), false);
});

test('department routing covers the original support areas', () => {
  for (const area of ['account', 'portals', 'lab']) assert.equal(ticketDepartment(area), 'it');
  assert.equal(ticketDepartment('records'), 'registrar');
  assert.equal(ticketDepartment('fees'), 'finance');
  assert.equal(ticketDepartment('other'), 'review');
  assert.equal(ticketDepartment('unknown'), 'review');
  assert.equal(departmentLabel('finance'), 'Finance / Cashier');
});

test('user text is escaped before rendering HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(null), '');
});
