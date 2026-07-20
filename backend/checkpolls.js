const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const polls = await p.post.findMany({
      where: { type: 'POLL' },
      select: { id:true, pollExpiresAt:true, pollAllowMultiple:true, hidden:true, isDraft:true,
        locales: true,
        pollOptions: { select: { id:true, textEn:true, _count:{ select:{ votes:true } } } } },
      orderBy: { createdAt: 'desc' }, take: 40,
    });
    const now = Date.now();
    console.log('now =', new Date(now).toISOString());
    for (const poll of polls) {
      const title = (poll.locales && (poll.locales.en?.title || poll.locales.title)) || JSON.stringify(poll.locales)?.slice(0,40);
      const exp = poll.pollExpiresAt ? new Date(poll.pollExpiresAt).toISOString() : 'none';
      const closed = poll.pollExpiresAt && new Date(poll.pollExpiresAt).getTime() <= now;
      console.log(`\n[${closed ? 'CLOSED' : 'OPEN  '}] "${title}"  exp=${exp}  hidden=${poll.hidden} draft=${poll.isDraft} opts=${poll.pollOptions.length}`);
    }
    console.log('\nTotal polls:', polls.length, ' closed:', polls.filter(x=>x.pollExpiresAt && new Date(x.pollExpiresAt).getTime()<=now).length);
  } catch(e){ console.error('ERR', e.message); } finally { await p.$disconnect(); }
})();
