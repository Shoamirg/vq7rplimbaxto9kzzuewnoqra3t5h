abstract interface class PhotoAccess {
  Future<String> uploadPhoto(List<int> bytes, String name);
  Future<List<int>> photoBytes(String url);
}
