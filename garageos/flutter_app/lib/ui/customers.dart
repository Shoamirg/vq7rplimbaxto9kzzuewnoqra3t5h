import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'booking.dart';
import 'staff_home.dart' show Pager;

class CustomerList extends StatefulWidget {
  const CustomerList({super.key, required this.repository, this.pick = false});
  final GarageRepository repository;
  final bool pick;
  @override
  State<CustomerList> createState() => _CustomerListState();
}

class _CustomerListState extends State<CustomerList> {
  String query = '';
  int page = 1;
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: Space.contentWidth),
      child: LoadView<PageData<Customer>>(
        load: () => widget.repository.customers(query: query, page: page),
        builder: (data, reload) => ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
            Wrap(
              spacing: 16,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  widget.pick ? 'Mijozni tanlang' : 'Mijozlar',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                FilledButton.icon(
                  onPressed: () async {
                    final customer = await openPage<Customer>(
                      context,
                      CustomerForm(repository: widget.repository),
                    );
                    if (!context.mounted) return;
                    if (widget.pick && customer != null) {
                      Navigator.pop(context, customer);
                    } else {
                      reload();
                    }
                  },
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Yangi mijoz'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            TextField(
              controller: search,
              decoration: const InputDecoration(
                labelText: 'Mijoz qidirish',
                hintText: 'Ism yoki telefon…',
                prefixIcon: Icon(Icons.search),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (s) => setState(() {
                query = s.trim();
                page = 1;
              }),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: Text('${data.total} ta mijoz topildi')),
                IconButton(
                  tooltip: 'Yangilash',
                  onPressed: reload,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            if (data.items.isEmpty)
              const EmptyNotice(
                'Mijoz topilmadi',
                'Telefon bo‘yicha qidiring yoki yangi mijoz qoʻshing.',
              ),
            for (final customer in data.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(16),
                    title: Text(customer.name),
                    subtitle: Text(
                      '${customer.phone}\n${customer.vehicleCount} ta mashina',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      if (widget.pick) {
                        Navigator.pop(context, customer);
                        return;
                      }
                      await openPage(
                        context,
                        CustomerScreen(
                          repository: widget.repository,
                          customer: customer,
                        ),
                      );
                      if (mounted) reload();
                    },
                  ),
                ),
              ),
            Pager(
              page: page,
              total: data.total,
              hasNext: data.hasNext,
              onPage: (p) => setState(() => page = p),
            ),
          ],
        ),
      ),
    ),
  );
}

class CustomerPicker extends StatelessWidget {
  const CustomerPicker({super.key, required this.repository});
  final GarageRepository repository;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: 'Mijozni tanlash',
    demo: repository.isDemo,
    body: CustomerList(repository: repository, pick: true),
  );
}

class CustomerScreen extends StatelessWidget {
  const CustomerScreen({
    super.key,
    required this.repository,
    required this.customer,
  });
  final GarageRepository repository;
  final Customer customer;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: customer.name,
    demo: repository.isDemo,
    body: LoadView<List<Car>>(
      load: () => repository.cars(customer.id),
      builder: (cars, reload) => ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  customer.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                SelectableText(customer.phone),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 16,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                'Mashinalar',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  await openPage(
                    context,
                    CarForm(repository: repository, customer: customer),
                  );
                  if (context.mounted) reload();
                },
                icon: const Icon(Icons.add),
                label: const Text('Mashina qoʻshish'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (cars.isEmpty)
            const EmptyNotice(
              'Mashina yoʻq',
              'Navbat yaratish uchun mashina qoʻshing.',
              icon: Icons.directions_car_outlined,
            ),
          for (final car in cars)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Plate(car.plate),
                    const SizedBox(height: 12),
                    Text(
                      car.modelLabel,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text('${car.year} · ${car.km} km'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: () => openPage(
                        context,
                        BookingScreen(
                          repository: repository,
                          customer: customer,
                          car: car,
                        ),
                      ),
                      icon: const Icon(Icons.event_available_outlined),
                      label: const Text('Navbat yaratish'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

String? requiredText(String? s) =>
    s == null || s.trim().isEmpty ? 'Bu maydonni toʻldiring.' : null;
String? phoneError(String? s) {
  final text = s?.trim() ?? '';
  final digits = text.replaceAll(RegExp(r'\D'), '');
  return RegExp(r'^\+?[0-9\s\-()]{7,20}$').hasMatch(text) &&
          digits.length >= 7 &&
          digits.length <= 15
      ? null
      : 'Toʻgʻri telefon raqamini kiriting.';
}

class CustomerForm extends StatefulWidget {
  const CustomerForm({super.key, required this.repository});
  final GarageRepository repository;
  @override
  State<CustomerForm> createState() => _CustomerFormState();
}

class _CustomerFormState extends State<CustomerForm> {
  final form = GlobalKey<FormState>(),
      name = TextEditingController(),
      phone = TextEditingController(text: '+998');
  bool busy = false, dirty = false;
  String? error;
  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final customer = await widget.repository.createCustomer(
        name.text.trim(),
        phone.text.trim(),
      );
      if (mounted) Navigator.pop(context, customer);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: 'Yangi mijoz',
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
          TextFormField(
            controller: name,
            enabled: !busy,
            maxLength: 255,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(labelText: 'Ism va familiya'),
            validator: requiredText,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: phone,
            enabled: !busy,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(labelText: 'Telefon'),
            validator: phoneError,
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
          child: SaveButton(label: 'Saqlash', onPressed: save, busy: busy),
        ),
      ],
    ),
  );
}

class CarForm extends StatefulWidget {
  const CarForm({super.key, required this.repository, required this.customer});
  final GarageRepository repository;
  final Customer customer;
  @override
  State<CarForm> createState() => _CarFormState();
}

class _CarFormState extends State<CarForm> {
  final form = GlobalKey<FormState>();
  final plate = TextEditingController(),
      year = TextEditingController(text: '${DateTime.now().year}'),
      km = TextEditingController(text: '0');
  late Future<List<CarModel>> models = widget.repository.catalog();
  String? modelId, error;
  bool busy = false, dirty = false;
  @override
  void dispose() {
    plate.dispose();
    year.dispose();
    km.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final car = await widget.repository.createCar({
        'customer_id': widget.customer.id,
        'vehicle_model_id': modelId,
        'license_plate': plate.text.trim(),
        'year': int.parse(year.text),
        'current_km': int.parse(km.text),
      });
      if (mounted) Navigator.pop(context, car);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: 'Mashina qoʻshish',
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: FutureBuilder<List<CarModel>>(
      future: models,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              ErrorNotice(
                failureText(snapshot.error!),
                retry: () => setState(() {
                  models = widget.repository.catalog();
                }),
              ),
            ],
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.data!.isEmpty) {
          return const EmptyNotice(
            'Mashina modellari yoʻq',
            'Serverga marka va modellarni qoʻshib, qayta oching.',
          );
        }
        return Form(
          key: form,
          onChanged: () => setState(() => dirty = true),
          child: ListView(
            padding: const EdgeInsets.all(Space.page),
            children: [
              Text(
                widget.customer.name,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 24),
              if (error != null) ErrorNotice(error!),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: modelId,
                decoration: const InputDecoration(labelText: 'Marka va model'),
                menuMaxHeight: 360,
                items: snapshot.data!
                    .map(
                      (m) =>
                          DropdownMenuItem(value: m.id, child: Text(m.label)),
                    )
                    .toList(),
                onChanged: busy ? null : (v) => setState(() => modelId = v),
                validator: requiredText,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: plate,
                enabled: !busy,
                textCapitalization: TextCapitalization.characters,
                maxLength: 20,
                decoration: const InputDecoration(
                  labelText: 'Davlat raqami',
                  hintText: '01 A 123 BC',
                ),
                validator: (v) =>
                    RegExp(r'^[A-Za-z0-9]{2,20}$')
                        .hasMatch((v ?? '').replaceAll(RegExp(r'[\s-]'), ''))
                    ? null
                    : 'Davlat raqamini kiriting.',
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: year,
                enabled: !busy,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Ishlab chiqarilgan yil',
                ),
                validator: (v) {
                  final y = int.tryParse(v ?? '');
                  return y != null && y >= 1900 && y <= DateTime.now().year + 1
                      ? null
                      : 'Toʻgʻri yilni kiriting.';
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: km,
                enabled: !busy,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Yurgan masofa',
                  suffixText: 'km',
                ),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  return n != null && n >= 0 && n <= 2147483647
                      ? null
                      : 'Toʻgʻri masofani kiriting.';
                },
              ),
            ],
          ),
        );
      },
    ),
    footer: FutureBuilder<List<CarModel>>(
      future: models,
      builder: (context, snapshot) => Row(
        children: [
          TextButton(
            onPressed: busy ? null : () => Navigator.maybePop(context),
            child: const Text('Bekor qilish'),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: SaveButton(
              label: 'Saqlash',
              onPressed: snapshot.hasData && snapshot.data!.isNotEmpty
                  ? save
                  : null,
              busy: busy,
            ),
          ),
        ],
      ),
    ),
  );
}
