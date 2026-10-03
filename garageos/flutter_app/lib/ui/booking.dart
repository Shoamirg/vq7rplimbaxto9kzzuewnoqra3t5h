import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'customers.dart';

class BookingScreen extends StatefulWidget {
  const BookingScreen({
    super.key,
    required this.repository,
    this.customer,
    this.car,
  });
  final GarageRepository repository;
  final Customer? customer;
  final Car? car;
  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  final form = GlobalKey<FormState>();
  final mechanic = TextEditingController(), notes = TextEditingController();
  late Customer? customer = widget.customer;
  late Car? car = widget.car;
  List<Car> cars = [];
  DateTime date = DateTime.now();
  TimeOfDay time = const TimeOfDay(hour: 10, minute: 0);
  int duration = 60;
  bool busy = false, loadingCars = false, dirty = false;
  int carsRequest = 0;
  String? error;
  @override
  void initState() {
    super.initState();
    if (customer != null) loadCars();
  }

  @override
  void dispose() {
    mechanic.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> loadCars() async {
    final owner = customer!.id;
    final request = ++carsRequest;
    setState(() {
      loadingCars = true;
      error = null;
    });
    try {
      final data = await widget.repository.cars(owner);
      if (mounted && customer?.id == owner && request == carsRequest) {
        setState(() {
          cars = data;
          loadingCars = false;
        });
      }
    } catch (e) {
      if (mounted && customer?.id == owner && request == carsRequest) {
        setState(() {
          loadingCars = false;
          error = failureText(e);
        });
      }
    }
  }

  Future<void> pickCustomer() async {
    final selected = await openPage<Customer>(
      context,
      CustomerPicker(repository: widget.repository),
    );
    if (selected == null || !mounted) return;
    setState(() {
      customer = selected;
      dirty = true;
      car = null;
      cars = [];
    });
    await loadCars();
  }

  Future<void> save() async {
    if (!validateForm(form)) return;
    if (customer == null || car == null) {
      setState(() => error = 'Avval mijoz va mashinani tanlang.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final created = await widget.repository.createWork({
        'customer_id': customer!.id,
        'vehicle_id': car!.id,
        'appointment_date': dateKey(date),
        'appointment_time':
            '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
        'estimated_duration_minutes': duration,
        'mechanic_name': mechanic.text.trim().isEmpty
            ? null
            : mechanic.text.trim(),
        'customer_notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
      });
      if (mounted) Navigator.pop(context, created);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: 'Yangi navbat',
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: Form(
      key: form,
      onChanged: () => setState(() => dirty = true),
      child: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          if (error != null) ErrorNotice(error!),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Mijoz', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (customer != null) ...[
                  Text(customer!.name),
                  Text(customer!.phone),
                  const SizedBox(height: 8),
                ],
                OutlinedButton.icon(
                  onPressed: busy ? null : pickCustomer,
                  icon: const Icon(Icons.person_search_outlined),
                  label: Text(
                    customer == null
                        ? 'Mijozni tanlash'
                        : 'Mijozni oʻzgartirish',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text('Mashina', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          if (loadingCars) const LinearProgressIndicator(),
          for (final item in cars)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  title: Text(item.modelLabel),
                  subtitle: Align(
                    alignment: Alignment.centerLeft,
                    child: Plate(item.plate),
                  ),
                  leading: Icon(
                    car?.id == item.id
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    color: car?.id == item.id
                        ? context.colors.brand
                        : context.colors.secondary,
                  ),
                  selected: car?.id == item.id,
                  onTap: busy
                      ? null
                      : () => setState(() {
                          car = item;
                          dirty = true;
                        }),
                ),
              ),
            ),
          if (customer != null)
            OutlinedButton.icon(
              onPressed: busy || loadingCars
                  ? null
                  : () async {
                      final added = await openPage<Car>(
                        context,
                        CarForm(
                          repository: widget.repository,
                          customer: customer!,
                        ),
                      );
                      if (added != null && mounted) {
                        car = added;
                        dirty = true;
                        await loadCars();
                      }
                    },
              icon: const Icon(Icons.add),
              label: const Text('Mashina qoʻshish'),
            ),
          const SizedBox(height: 24),
          Text(
            'Vaqt va servis',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: busy
                ? null
                : () async {
                    final selected = await showDatePicker(
                      context: context,
                      initialDate: date,
                      firstDate: DateTime.now().subtract(
                        const Duration(days: 1),
                      ),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (selected != null && mounted) {
                      setState(() {
                        date = selected;
                        dirty = true;
                      });
                    }
                  },
            icon: const Icon(Icons.calendar_today_outlined),
            label: Text(dateLabel(date)),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: busy
                ? null
                : () async {
                    final selected = await showTimePicker(
                      context: context,
                      initialTime: time,
                      builder: (c, child) => MediaQuery(
                        data: MediaQuery.of(c)
                            .copyWith(alwaysUse24HourFormat: true),
                        child: child!,
                      ),
                    );
                    if (selected != null && mounted) {
                      setState(() {
                        time = selected;
                        dirty = true;
                      });
                    }
                  },
            icon: const Icon(Icons.schedule),
            label: Text(
              '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
            ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<int>(
            initialValue: duration,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Davomiyligi'),
            items: [30, 45, 60, 90, 120, 180, 240]
                .map(
                  (n) => DropdownMenuItem(value: n, child: Text('$n daqiqa')),
                )
                .toList(),
            onChanged: busy ? null : (v) => setState(() => duration = v!),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: mechanic,
            enabled: !busy,
            maxLength: 255,
            decoration: const InputDecoration(
              labelText: 'Usta',
              helperText: 'Ishni boshlashdan oldin usta tayinlang.',
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: notes,
            enabled: !busy,
            maxLines: 3,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Mijoz shikoyati / servis izohi',
            ),
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        TextButton(
          onPressed: busy ? null : () => Navigator.maybePop(context),
          child: const Text('Bekor qilish'),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: 'Navbat yaratish',
            onPressed: save,
            busy: busy,
          ),
        ),
      ],
    ),
  );
}
