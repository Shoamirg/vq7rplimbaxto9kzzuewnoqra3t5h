import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../l10n/l10n.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'customers.dart';
import 'work_detail.dart';

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
  final notes = TextEditingController();
  Mechanic? mechanic;
  late Customer? customer = widget.customer;
  late Car? car = widget.car;
  List<Car> cars = [];
  DateTime date = DateTime.now();
  TimeOfDay time = TimeOfDay(hour: 10, minute: 0);
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
    if (!widget.repository.canWrite || busy) return;
    if (!validateForm(form)) return;
    if (customer == null || car == null) {
      setState(() => error = context.l10n.pickCustomerError);
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
        'mechanic_user_id': mechanic?.id,
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
    title: context.l10n.newAppointment,
    demo: widget.repository.isDemo,
    readOnly: !widget.repository.canWrite,
    hasChanges: dirty,
    isSaving: busy,
    body: Form(
      key: form,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      onChanged: () => setState(() => dirty = true),
      child: ListView(
        padding: EdgeInsets.all(Space.page),
        children: [
          if (error != null) ErrorNotice(error!),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  context.l10n.customer,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                SizedBox(height: 8),
                if (customer != null) ...[
                  Text(customer!.name),
                  Text(customer!.phone),
                  SizedBox(height: 8),
                ],
                OutlinedButton.icon(
                  onPressed: busy || !widget.repository.canWrite
                      ? null
                      : pickCustomer,
                  icon: Icon(Icons.person_search_outlined),
                  label: Text(
                    customer == null
                        ? context.l10n.chooseCustomer
                        : context.l10n.changeCustomer,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: 24),
          Text(
            context.l10n.vehicle,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          SizedBox(height: 12),
          if (loadingCars) LinearProgressIndicator(),
          for (final item in cars)
            Padding(
              padding: EdgeInsets.only(bottom: 8),
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
                  onTap: busy || !widget.repository.canWrite
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
              onPressed: busy || !widget.repository.canWrite || loadingCars
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
              icon: Icon(Icons.add),
              label: Text(context.l10n.addVehicle),
            ),
          SizedBox(height: 24),
          Text(
            context.l10n.timeAndService,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: busy || !widget.repository.canWrite
                ? null
                : () async {
                    final selected = await showDatePicker(
                      context: context,
                      initialDate: date,
                      firstDate: DateTime.now().subtract(Duration(days: 1)),
                      lastDate: DateTime.now().add(Duration(days: 365)),
                    );
                    if (selected != null && mounted) {
                      setState(() {
                        date = selected;
                        dirty = true;
                      });
                    }
                  },
            icon: Icon(Icons.calendar_today_outlined),
            label: Text(context.date(date)),
          ),
          SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: busy || !widget.repository.canWrite
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
            icon: Icon(Icons.schedule),
            label: Text(
              '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
            ),
          ),
          SizedBox(height: 16),
          DropdownButtonFormField<int>(
            initialValue: duration,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.l10n.duration),
            items: [30, 45, 60, 90, 120, 180, 240]
                .map(
                  (n) => DropdownMenuItem(
                    value: n,
                    child: Text(context.l10n.minutes(n)),
                  ),
                )
                .toList(),
            onChanged: busy || !widget.repository.canWrite
                ? null
                : (v) => setState(() => duration = v!),
          ),
          SizedBox(height: 16),
          Text(
            context.l10n.mechanic,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (mechanic != null) ...[
            Text(mechanic!.name),
            Text(mechanic!.email),
          ] else
            Text(context.l10n.unassigned),
          OutlinedButton.icon(
            onPressed: busy || !widget.repository.canWrite
                ? null
                : () async {
                    final selected = await openPage<Mechanic>(
                      context,
                      MechanicPicker(
                        repository: widget.repository,
                        initial: mechanic?.name,
                      ),
                    );
                    if (selected != null && mounted) {
                      setState(() {
                        mechanic = selected;
                        dirty = true;
                      });
                    }
                  },
            icon: const Icon(Icons.person_search_outlined),
            label: Text(context.l10n.assignMechanic),
          ),
          if (mechanic != null)
            TextButton(
              onPressed: busy || !widget.repository.canWrite
                  ? null
                  : () => setState(() {
                      mechanic = null;
                      dirty = true;
                    }),
              child: Text(context.l10n.unassigned),
            ),
          SizedBox(height: 16),
          TextFormField(
            controller: notes,
            enabled: !busy && widget.repository.canWrite,
            maxLines: 3,
            maxLength: 1000,
            decoration: InputDecoration(labelText: context.l10n.customerNotes),
          ),
        ],
      ),
    ),
    footer: !widget.repository.canWrite
        ? null
        : Row(
            children: [
              TextButton(
                onPressed: busy || !widget.repository.canWrite
                    ? null
                    : () => Navigator.maybePop(context),
                child: Text(context.l10n.cancel),
              ),
              SizedBox(width: 8),
              Expanded(
                child: SaveButton(
                  label: context.l10n.createAppointment,
                  onPressed: save,
                  busy: busy,
                ),
              ),
            ],
          ),
  );
}
