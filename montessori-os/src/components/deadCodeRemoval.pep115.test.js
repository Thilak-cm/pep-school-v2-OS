import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');

describe('PEP-115: Dead bulk report code removal', () => {
  it('StudentList.jsx should not exist', () => {
    const filePath = resolve(root, 'montessori-os/src/components/StudentList.jsx');
    assert.equal(existsSync(filePath), false, 'StudentList.jsx should be deleted');
  });

  it('App.jsx should not reference StudentList or studentList screen', () => {
    const appSrc = readFileSync(resolve(root, 'montessori-os/src/App.jsx'), 'utf8');
    assert.equal(appSrc.includes('StudentList'), false, 'App.jsx should not import StudentList');
    assert.equal(appSrc.includes("'studentList'"), false, 'App.jsx should not reference studentList screen');
  });

  it('functions/index.js should not export generateClassroomReports', () => {
    const src = readFileSync(resolve(root, 'functions/index.js'), 'utf8');
    assert.equal(src.includes('generateClassroomReports'), false, 'generateClassroomReports should be removed');
  });

  it('functions/index.js should not export exportClassroomReportsToDrive', () => {
    const src = readFileSync(resolve(root, 'functions/index.js'), 'utf8');
    assert.equal(src.includes('exportClassroomReportsToDrive'), false, 'exportClassroomReportsToDrive should be removed');
  });

  it('REPORT_BULK_CONCURRENCY should not exist in reportConstants.js', () => {
    const src = readFileSync(resolve(root, 'functions/config/reportConstants.js'), 'utf8');
    assert.equal(src.includes('REPORT_BULK_CONCURRENCY'), false, 'REPORT_BULK_CONCURRENCY should be removed');
  });

  it('REPORT_BULK_CONCURRENCY should not be imported in functions/index.js', () => {
    const src = readFileSync(resolve(root, 'functions/index.js'), 'utf8');
    assert.equal(src.includes('REPORT_BULK_CONCURRENCY'), false, 'REPORT_BULK_CONCURRENCY import should be removed');
  });

  it('ReportGenerateDialog should not have bulkCount prop', () => {
    const src = readFileSync(resolve(root, 'montessori-os/src/components/ReportGenerateDialog.jsx'), 'utf8');
    assert.equal(src.includes('bulkCount'), false, 'bulkCount prop should be removed');
    assert.equal(src.includes('isBulk'), false, 'isBulk variable should be removed');
  });

  it('runWithConcurrency helper should still exist (used by baseball cards)', () => {
    const src = readFileSync(resolve(root, 'functions/ai/baseballCard.js'), 'utf8');
    assert.equal(src.includes('runWithConcurrency'), true, 'runWithConcurrency must be preserved');
  });
});
