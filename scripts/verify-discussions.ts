/**
 * Functional checks for course discussions (PRD §14).
 *
 * The failures worth catching are quiet ones: a like counter that can be
 * inflated by clicking twice, a reply grafted onto a thread it does not belong
 * to, a locked thread that still accepts posts, or an outsider reading a
 * course's conversation.
 *
 *   npx tsx scripts/verify-discussions.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import {
  addComment,
  createPost,
  deleteComment,
  getPost,
  listPosts,
  moderatePost,
  toggleLike,
} from "../lib/discussions";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RUN = Math.random().toString(36).slice(2, 8);
const results: string[] = [];
const createdUsers: string[] = [];
const createdCourses: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.achievement.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourses } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
}

const STUDENT = ["STUDENT"];
const INSTRUCTOR = ["INSTRUCTOR"];

async function main() {
  const category = await prisma.category.findFirstOrThrow();

  const teacher = await prisma.user.create({
    data: { email: `dsc-teacher-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Disc", lastName: "Teacher" } } },
  });
  createdUsers.push(teacher.id);

  const learner = await prisma.user.create({
    data: { email: `dsc-learner-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Disc", lastName: "Learner" } } },
  });
  createdUsers.push(learner.id);

  const classmate = await prisma.user.create({
    data: { email: `dsc-mate-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Class", lastName: "Mate" } } },
  });
  createdUsers.push(classmate.id);

  const outsider = await prisma.user.create({
    data: { email: `dsc-outsider-${RUN}@demo.local`, status: "ACTIVE",
      profile: { create: { firstName: "Out", lastName: "Sider" } } },
  });
  createdUsers.push(outsider.id);

  const course = await prisma.course.create({
    data: { title: `Discussion Course ${RUN}`, slug: `discussion-course-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id },
    select: { id: true },
  });
  createdCourses.push(course.id);

  const otherCourse = await prisma.course.create({
    data: { title: `Other Course ${RUN}`, slug: `other-disc-${RUN}`, status: "PUBLISHED",
      instructorId: teacher.id, categoryId: category.id },
    select: { id: true },
  });
  createdCourses.push(otherCourse.id);

  for (const user of [learner, classmate]) {
    await prisma.enrollment.create({ data: { userId: user.id, courseId: course.id, status: "ACTIVE" } });
  }

  // --- access -------------------------------------------------------------
  const outsiderList = await listPosts(course.id, outsider.id, STUDENT);
  check("a non-enrolled user cannot see the discussion", outsiderList === null,
    outsiderList === null ? "null" : "leaked");

  const learnerList = await listPosts(course.id, learner.id, STUDENT);
  check("an enrolled learner can see the discussion", learnerList !== null,
    learnerList ? `${learnerList.posts.length} posts` : "null");
  check("a learner is not a moderator", learnerList?.moderator === false, `${learnerList?.moderator}`);

  const teacherList = await listPosts(course.id, teacher.id, INSTRUCTOR);
  check("the course instructor moderates", teacherList?.moderator === true, `${teacherList?.moderator}`);

  // --- posting ------------------------------------------------------------
  const outsiderPost = await createPost(course.id, outsider.id, STUDENT, { body: "Sneaking in" });
  check("a non-enrolled user cannot post", !outsiderPost.ok, outsiderPost.ok ? "posted!" : outsiderPost.error);

  const empty = await createPost(course.id, learner.id, STUDENT, { body: "   " });
  check("an empty post is refused", !empty.ok && empty.error === "INVALID",
    empty.ok ? "posted!" : empty.error);

  const huge = await createPost(course.id, learner.id, STUDENT, { body: "x".repeat(5001) });
  check("an oversized post is refused", !huge.ok && huge.error === "INVALID",
    huge.ok ? "posted!" : huge.error);

  const posted = await createPost(course.id, learner.id, STUDENT, {
    title: "How does breach notification work?", body: "What is the deadline in practice?",
  });
  check("an enrolled learner posts", posted.ok, posted.ok ? posted.data.id : posted.error);
  if (!posted.ok) return finish();

  // A learner must not be able to grant their own post announcement status.
  const fakeAnnouncement = await createPost(course.id, learner.id, STUDENT, {
    body: "Everyone read this", isAnnouncement: true,
  });
  const fakeRow = fakeAnnouncement.ok
    ? await prisma.discussionPost.findUniqueOrThrow({
        where: { id: fakeAnnouncement.data.id }, select: { isAnnouncement: true, isPinned: true },
      })
    : null;
  check("a learner cannot make their post an announcement",
    fakeRow?.isAnnouncement === false && fakeRow.isPinned === false,
    `announcement=${fakeRow?.isAnnouncement}`);

  const announcement = await createPost(course.id, teacher.id, INSTRUCTOR, {
    title: "Session moved", body: "Thursday instead of Wednesday.", isAnnouncement: true,
  });
  const annRow = announcement.ok
    ? await prisma.discussionPost.findUniqueOrThrow({
        where: { id: announcement.data.id }, select: { isAnnouncement: true, isPinned: true },
      })
    : null;
  check("an instructor announcement is pinned", annRow?.isAnnouncement === true && annRow.isPinned === true,
    `pinned=${annRow?.isPinned}`);

  const notified = await prisma.notification.count({
    where: { userId: learner.id, title: { contains: "Announcement in" } },
  });
  check("an announcement notifies enrolled learners", notified === 1, `${notified} notification(s)`);

  const selfNotified = await prisma.notification.count({
    where: { userId: teacher.id, title: { contains: "Announcement in" } },
  });
  check("the author is not notified of their own announcement", selfNotified === 0, `${selfNotified}`);

  // --- replies ------------------------------------------------------------
  const reply = await addComment(posted.data.id, classmate.id, STUDENT, { body: "72 hours." });
  check("a classmate replies", reply.ok, reply.ok ? "replied" : reply.error);

  const authorNotified = await prisma.notification.count({
    where: { userId: learner.id, title: { contains: "New reply" } },
  });
  check("the thread author is told about a reply", authorNotified === 1, `${authorNotified}`);

  const outsiderReply = await addComment(posted.data.id, outsider.id, STUDENT, { body: "Hello" });
  check("a non-enrolled user cannot reply", !outsiderReply.ok,
    outsiderReply.ok ? "replied!" : outsiderReply.error);

  // A reply must belong to the thread it claims.
  const foreignPost = await createPost(otherCourse.id, teacher.id, INSTRUCTOR, { body: "Elsewhere" });
  const foreignComment = foreignPost.ok
    ? await addComment(foreignPost.data.id, teacher.id, INSTRUCTOR, { body: "Parent elsewhere" })
    : null;

  const grafted = foreignComment?.ok
    ? await addComment(posted.data.id, learner.id, STUDENT, {
        body: "Grafted", parentId: foreignComment.data.id,
      })
    : { ok: false as const, error: "INVALID" as const };
  check("a reply cannot be grafted onto another thread's comment",
    !grafted.ok && grafted.error === "INVALID", grafted.ok ? "grafted!" : grafted.error);

  // --- likes --------------------------------------------------------------
  const liked = await toggleLike({ postId: posted.data.id }, classmate.id, STUDENT);
  check("liking a post records it", liked.ok && liked.data.liked && liked.data.likeCount === 1,
    liked.ok ? `count=${liked.data.likeCount}` : liked.error);

  // The bug a bare counter cannot prevent.
  const likedTwice = await toggleLike({ postId: posted.data.id }, classmate.id, STUDENT);
  check("liking again unlikes rather than incrementing",
    likedTwice.ok && !likedTwice.data.liked && likedTwice.data.likeCount === 0,
    likedTwice.ok ? `count=${likedTwice.data.likeCount}` : likedTwice.error);

  await toggleLike({ postId: posted.data.id }, classmate.id, STUDENT);
  await toggleLike({ postId: posted.data.id }, learner.id, STUDENT);
  const twoLikes = await prisma.discussionPost.findUniqueOrThrow({
    where: { id: posted.data.id }, select: { likeCount: true },
  });
  check("two people liking gives a count of two", twoLikes.likeCount === 2, `${twoLikes.likeCount}`);

  // Rapid double-clicks must not inflate the count.
  await Promise.all([
    toggleLike({ commentId: reply.ok ? reply.data.id : "" }, learner.id, STUDENT).catch(() => null),
    toggleLike({ commentId: reply.ok ? reply.data.id : "" }, learner.id, STUDENT).catch(() => null),
  ]);
  const commentLikes = await prisma.discussionLike.count({
    where: { commentId: reply.ok ? reply.data.id : "" },
  });
  check("concurrent likes cannot exceed one per person", commentLikes <= 1, `${commentLikes} like row(s)`);

  const outsiderLike = await toggleLike({ postId: posted.data.id }, outsider.id, STUDENT);
  check("a non-enrolled user cannot like", !outsiderLike.ok,
    outsiderLike.ok ? "liked!" : outsiderLike.error);

  // --- moderation ---------------------------------------------------------
  const learnerLock = await moderatePost(posted.data.id, learner.id, STUDENT, "lock");
  check("a learner cannot lock a thread", !learnerLock.ok && learnerLock.error === "FORBIDDEN",
    learnerLock.ok ? "locked!" : learnerLock.error);

  const locked = await moderatePost(posted.data.id, teacher.id, INSTRUCTOR, "lock");
  check("an instructor locks a thread", locked.ok, locked.ok ? "locked" : locked.error);

  const afterLock = await addComment(posted.data.id, classmate.id, STUDENT, { body: "Still here?" });
  check("a locked thread refuses new replies", !afterLock.ok && afterLock.error === "LOCKED",
    afterLock.ok ? "replied!" : afterLock.error);

  const modReply = await addComment(posted.data.id, teacher.id, INSTRUCTOR, { body: "Closing note." });
  check("a moderator can still reply to a locked thread", modReply.ok,
    modReply.ok ? "replied" : modReply.error);

  // --- deletion -----------------------------------------------------------
  const strangerDelete = await deleteComment(reply.ok ? reply.data.id : "", learner.id, STUDENT);
  check("a learner cannot delete someone else's reply",
    !strangerDelete.ok && strangerDelete.error === "FORBIDDEN",
    strangerDelete.ok ? "deleted!" : strangerDelete.error);

  const ownDelete = await deleteComment(reply.ok ? reply.data.id : "", classmate.id, STUDENT);
  check("an author deletes their own reply", ownDelete.ok, ownDelete.ok ? "deleted" : ownDelete.error);

  const stillThere = await prisma.comment.findUniqueOrThrow({
    where: { id: reply.ok ? reply.data.id : "" }, select: { deletedAt: true },
  });
  check("deletion is soft, not destructive", stillThere.deletedAt !== null, "deletedAt set");

  const thread = await getPost(posted.data.id, learner.id, STUDENT);
  check("a deleted reply is hidden from the thread",
    thread?.comments.every((c) => c.id !== (reply.ok ? reply.data.id : "")) === true,
    `${thread?.comments.length} visible`);

  const deletedThread = await moderatePost(posted.data.id, teacher.id, INSTRUCTOR, "delete");
  check("a moderator deletes a thread", deletedThread.ok, deletedThread.ok ? "deleted" : deletedThread.error);

  const gone = await getPost(posted.data.id, learner.id, STUDENT);
  check("a deleted thread is no longer readable", gone === null, gone === null ? "null" : "still visible");

  const listAfter = await listPosts(course.id, learner.id, STUDENT);
  check("a deleted thread leaves the list",
    listAfter?.posts.every((p) => p.id !== posted.data.id) === true,
    `${listAfter?.posts.length} posts`);

  return finish();
}

async function finish() {
  console.log(results.join("\n"));
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed`);
  return passed === results.length;
}

main()
  .then(async (ok) => {
    await cleanup();
    console.log("cleaned up fixtures");
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch((e) => console.error("cleanup failed for run", RUN, ":", (e as Error).message));
    await prisma.$disconnect();
    process.exit(1);
  });
