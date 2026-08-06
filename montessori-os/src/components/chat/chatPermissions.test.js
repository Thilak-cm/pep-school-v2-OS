import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageChildChat } from './chatPermissions.js';

const reader = { uid: 'reader-1' };
const otherChat = { id: 'chat-1', createdBy: 'creator-1', classroomId: 'allstars' };

test('chat creator can manage their conversation', () => {
  assert.equal(canManageChildChat({
    chat: { ...otherChat, createdBy: reader.uid },
    currentUser: reader,
    userRole: 'teacher',
  }), true);
});

test('teacher reader cannot manage another creator\'s conversation', () => {
  assert.equal(canManageChildChat({
    chat: otherChat,
    currentUser: reader,
    userRole: 'teacher',
  }), false);
});

test('superadmin can manage another creator\'s conversation', () => {
  assert.equal(canManageChildChat({
    chat: otherChat,
    currentUser: reader,
    userRole: 'superadmin',
  }), true);
});

test('classroomadmin can manage only conversations in their classroom scope', () => {
  const base = {
    chat: otherChat,
    currentUser: reader,
    userRole: 'classroomadmin',
  };
  assert.equal(canManageChildChat({
    ...base,
    manageableClassrooms: ['allstars'],
    studentClassroomId: 'allstars',
  }), true);
  assert.equal(canManageChildChat({
    ...base,
    manageableClassrooms: ['periwinkle'],
    studentClassroomId: 'allstars',
  }), false);
});

test('missing identity never exposes chat management', () => {
  assert.equal(canManageChildChat({
    chat: otherChat,
    currentUser: null,
    userRole: 'superadmin',
  }), false);
});
