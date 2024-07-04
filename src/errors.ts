export enum ErrorCodes {
  MessagesAttachmentFailed = 102001,
  PresenceAttachmentFailed = 102002,
  ReactionsAttachmentFailed = 102003,
  OccupancyAttachmentFailed = 102004,
  TypingAttachmentFailed = 102005,
  // 102006 - 102049 reserved for future use for attachment errors

  MessagesDetachmentFailed = 102050,
  PresenceDetachmentFailed = 102051,
  ReactionsDetachmentFailed = 102052,
  OccupancyDetachmentFailed = 102053,
  TypingDetachmentFailed = 102054,
  // 102055 - 102099 reserved for future use for detachment errors

  RoomDiscontinuity = 102100,

  // Unable to perform operation;
  RoomInFailedState = 102101,
  RoomIsReleasing = 102102,
  RoomIsReleased = 102103,
  PreviousOperationfailed = 102104,
}
