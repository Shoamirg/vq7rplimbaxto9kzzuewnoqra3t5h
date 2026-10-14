import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:garageos_staff/data/pending_idempotency.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test('reuses the saved retry key until the request is cleared', () async {
    final original = await PendingIdempotency.getOrCreate(
      'work',
      'customer-1:vehicle-1:2030-05-01:16:30',
    );

    expect(
      await PendingIdempotency.getOrCreate(
        'work',
        'customer-1:vehicle-1:2030-05-01:16:30',
      ),
      original,
    );

    await PendingIdempotency.clear(
      'work',
      'customer-1:vehicle-1:2030-05-01:16:30',
    );

    expect(
      await PendingIdempotency.getOrCreate(
        'work',
        'customer-1:vehicle-1:2030-05-01:16:30',
      ),
      isNot(original),
    );
  });

  test('keeps retry keys isolated by operation scope', () async {
    final workKey = await PendingIdempotency.getOrCreate('work', 'same-input');
    final paymentKey = await PendingIdempotency.getOrCreate(
      'payment',
      'same-input',
    );

    expect(paymentKey, isNot(workKey));
  });
}
