class AppNotification {
  const AppNotification(this.id, this.title, this.body);
  final String id, title, body;
}

abstract interface class NotificationFeed {
  Future<List<AppNotification>> notifications();
}
