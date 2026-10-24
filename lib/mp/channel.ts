// Opening and closing private Realtime channels without tripping over a channel of the same topic
// that is still leaving (a quick close and reopen, React StrictMode).
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase/client';

type Supabase = ReturnType<typeof createClient>;

// One removal per channel, shared by close and a reopen waiting for it.
const removing = new WeakMap<RealtimeChannel, Promise<unknown>>();

export function closeChannel(supabase: Supabase, ch: RealtimeChannel): Promise<unknown> {
  let p = removing.get(ch);
  if (!p) removing.set(ch, (p = supabase.removeChannel(ch).catch(() => 'error')));
  return p;
}

// Opens of one topic, one after another: channel() would hand an open still in progress the same
// channel object as a newer one.
const opening = new Map<string, Promise<unknown>>();

// A new channel for `topic`. channel() hands back an existing channel of the same topic, even one
// still leaving, so that one is removed first and the newest open wins. Async: if the caller has gone
// by the time this resolves, it must close what it gets. Add listeners, then subscribe().
export function freshChannel(supabase: Supabase, topic: string, config: RealtimeChannelOptions['config']): Promise<RealtimeChannel> {
  const next = (opening.get(topic) ?? Promise.resolve()).catch(() => {}).then(() => open(supabase, topic, config));
  opening.set(topic, next);
  const done = () => { if (opening.get(topic) === next) opening.delete(topic); };
  next.then(done, done);
  return next;
}

async function open(supabase: Supabase, topic: string, config: RealtimeChannelOptions['config']): Promise<RealtimeChannel> {
  if (config.private) await supabase.realtime.setAuth(); // private channels join with the user's token
  // realtime-js stores the topic as 'realtime:<topic>'. No await between the last check and channel().
  for (let tries = 0; tries < 3; tries++) {
    const old = supabase.getChannels().find(c => c.topic === `realtime:${topic}`);
    if (!old) break;
    await closeChannel(supabase, old);
  }
  return supabase.channel(topic, { config });
}
