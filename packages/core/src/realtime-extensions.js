/**
 * Adds a listener for channel messages without the side-effect of attaching the channel.
 *
 * @param channel The channel to add the listener to.
 * @param events The events to listen for.
 * @param listener The listener to add.
 */
export const addListenerToChannelWithoutAttach = (params) => {
    const subscriptions = params.channel.subscriptions;
    addListener(subscriptions, params.listener, params.events);
};
/**
 *  Adds a listener for channel presence messages without the side-effect of attaching the channel.
 *
 * @param channel The channel to add the listener to.
 * @param events The events to listen for.
 * @param listener The listener to add.
 */
export const addListenerToChannelPresenceWithoutAttach = (params) => {
    const subscriptions = params.channel.presence.subscriptions;
    addListener(subscriptions, params.listener, params.events);
};
const addListener = (subscription, listener, events) => {
    if (events) {
        subscription.on(events, listener);
        return;
    }
    subscription.on(listener);
};
//# sourceMappingURL=realtime-extensions.js.map