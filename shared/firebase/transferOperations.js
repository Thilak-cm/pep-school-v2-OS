function ymdFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Student transfer transaction shared by production and emulator rules tests.
 *
 * This deliberately owns the complete batch shape: close/backfill the source
 * placement, create the destination placement, then update the student's
 * current classroom. Timeline observations are never rewritten.
 */
export function createTransferOperations({ db, firestore }) {
  const {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    serverTimestamp,
    where,
    writeBatch,
  } = firestore;

  async function transferStudents({
    sourceClassroomId,
    destinationClassroomId,
    studentIds,
    lastDay,
    newStartDate,
    note = '',
    onDestinationReadError,
  }) {
    let destinationBranchId = null;
    try {
      const destinationSnapshot = await getDoc(
        doc(db, 'classrooms', destinationClassroomId),
      );
      if (destinationSnapshot.exists()) {
        destinationBranchId = destinationSnapshot.data()?.branchId || null;
      }
    } catch (error) {
      onDestinationReadError?.(error);
    }

    const batch = writeBatch(db);
    const failures = [];
    let successCount = 0;

    for (const studentId of studentIds) {
      try {
        const studentReference = doc(db, 'students', studentId);
        const studentSnapshot = await getDoc(studentReference);
        if (!studentSnapshot.exists()) {
          failures.push({ id: studentId, reason: 'missing student' });
          continue;
        }

        const student = studentSnapshot.data() || {};
        if (student.classroomId !== sourceClassroomId) {
          failures.push({ id: studentId, reason: 'moved since selection' });
          continue;
        }

        const activePlacementSnapshot = await getDocs(query(
          collection(db, 'students', studentId, 'placements'),
          where('endDate', '==', null),
          limit(1),
        ));

        if (!activePlacementSnapshot.empty) {
          batch.update(activePlacementSnapshot.docs[0].ref, {
            endDate: lastDay,
            status: 'ended',
            updatedAt: serverTimestamp(),
          });
        } else {
          if (!student.createdAt?.toDate) {
            failures.push({
              id: studentId,
              reason: 'no placement and no createdAt',
            });
            continue;
          }
          const backfillStart = ymdFromDate(student.createdAt.toDate());
          batch.set(
            doc(
              db,
              'students',
              studentId,
              'placements',
              `${backfillStart}__${sourceClassroomId}`,
            ),
            {
              classroomId: sourceClassroomId,
              startDate: backfillStart,
              endDate: lastDay,
              status: 'ended',
              createdAt: student.createdAt,
              updatedAt: serverTimestamp(),
            },
          );
        }

        batch.set(
          doc(
            db,
            'students',
            studentId,
            'placements',
            `${newStartDate}__${destinationClassroomId}`,
          ),
          {
            classroomId: destinationClassroomId,
            startDate: newStartDate,
            endDate: null,
            status: 'active',
            ...(note ? { note } : {}),
            createdAt: serverTimestamp(),
          },
        );

        const studentUpdate = {
          classroomId: destinationClassroomId,
          updatedAt: serverTimestamp(),
        };
        if (destinationBranchId) studentUpdate.branchId = destinationBranchId;
        batch.set(studentReference, studentUpdate, { merge: true });
        successCount += 1;
      } catch (error) {
        failures.push({
          id: studentId,
          reason: error?.message || 'error',
        });
      }
    }

    await batch.commit();
    return { successCount, failures };
  }

  return { transferStudents };
}
