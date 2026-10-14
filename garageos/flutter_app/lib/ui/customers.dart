import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../l10n/l10n.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'booking.dart';
import 'staff_home.dart' show Pager;

class CustomerList extends StatefulWidget {
  const CustomerList({
    super.key,
    required this.repository,
    this.pick = false,
    this.refreshKey = 0,
  });
  final GarageRepository repository;
  final bool pick;
  final int refreshKey;
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

  void updateSearch(String value) {
    if (query == value) return;
    setState(() {
      query = value;
      page = 1;
    });
  }

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: Space.contentWidth),
      child: ListLoadView<PageData<Customer>>(
        storageKey: widget.pick ? 'customer-picker' : 'staff-customer-list',
        filterKey: (query, page),
        loadKey: (widget.repository, query, page, widget.refreshKey),
        load: () => widget.repository.customers(query: query, page: page),
        header: (data, reload, loading) => [
          Wrap(
            spacing: 16,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                widget.pick
                    ? context.l10n.selectCustomer
                    : context.l10n.customers,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (widget.repository.canWrite)
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
                  icon: Icon(Icons.person_add_alt),
                  label: Text(context.l10n.newCustomer),
                ),
            ],
          ),
          SizedBox(height: 24),
          ListSearchField(
            controller: search,
            label: context.l10n.searchCustomers,
            hint: context.l10n.customerSearchHint,
            onSearch: updateSearch,
          ),
          SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  loading
                      ? context.l10n.customersLoading
                      : data == null
                      ? context.l10n.customersFailed
                      : context.l10n.customerCount(data.total),
                ),
              ),
              IconButton(
                tooltip: context.l10n.refresh,
                onPressed: loading ? null : reload,
                icon: Icon(Icons.refresh),
              ),
            ],
          ),
        ],
        items: (data, reload) => [
          if (data.items.isEmpty)
            EmptyNotice(
              context.l10n.noCustomerFound,
              query.isEmpty
                  ? context.l10n.newCustomerHint
                  : context.l10n.searchCustomersHint,
              action: query.isEmpty
                  ? null
                  : OutlinedButton.icon(
                      onPressed: () {
                        search.clear();
                        updateSearch('');
                      },
                      icon: Icon(Icons.search_off),
                      label: Text(context.l10n.clearSearch),
                    ),
            ),
          for (final customer in data.items)
            Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Card(
                child: ListTile(
                  contentPadding: EdgeInsets.all(16),
                  leading: ExcludeSemantics(
                    child: CircleAvatar(
                      backgroundColor: context.colors.muted,
                      foregroundColor: context.colors.secondary,
                      child: Text(
                        customer.name.trim().isEmpty
                            ? '—'
                            : customer.name
                                  .trim()
                                  .split(RegExp(r'\s+'))
                                  .take(2)
                                  .map((word) => word.characters.first)
                                  .join()
                                  .toUpperCase(),
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                    ),
                  ),
                  title: Text(customer.name),
                  titleTextStyle: Theme.of(context).textTheme.titleMedium,
                  subtitle: Text(
                    '${customer.phone}\n${context.l10n.vehicleCount(customer.vehicleCount)}',
                  ),
                  trailing: Icon(Icons.chevron_right),
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
  );
}

class CustomerPicker extends StatelessWidget {
  const CustomerPicker({super.key, required this.repository});
  final GarageRepository repository;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.chooseCustomer,
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
    readOnly: !repository.canWrite,
    body: LoadView<List<Car>>(
      loadKey: (repository, customer.id),
      load: () => repository.cars(customer.id),
      builder: (cars, reload) => ListView(
        padding: EdgeInsets.all(Space.page),
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  customer.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                SizedBox(height: 8),
                SelectableText(customer.phone),
              ],
            ),
          ),
          SizedBox(height: 24),
          Wrap(
            spacing: 16,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                context.l10n.vehicles,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (repository.canWrite)
                OutlinedButton.icon(
                  onPressed: () async {
                    await openPage(
                      context,
                      CarForm(repository: repository, customer: customer),
                    );
                    if (context.mounted) reload();
                  },
                  icon: Icon(Icons.add),
                  label: Text(context.l10n.addVehicle),
                ),
            ],
          ),
          SizedBox(height: 16),
          if (cars.isEmpty)
            EmptyNotice(
              context.l10n.noVehicles,
              context.l10n.addVehicleHint,
              icon: Icons.directions_car_outlined,
            ),
          for (final car in cars)
            Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Plate(car.plate),
                    SizedBox(height: 12),
                    Text(
                      car.modelLabel,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text('${car.year} · ${car.km} km'),
                    SizedBox(height: 12),
                    if (repository.canWrite)
                      FilledButton.icon(
                        onPressed: () => openPage(
                          context,
                          BookingScreen(
                            repository: repository,
                            customer: customer,
                            car: car,
                          ),
                        ),
                        icon: Icon(Icons.event_available_outlined),
                        label: Text(context.l10n.createAppointment),
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
    title: context.l10n.newCustomer,
    demo: widget.repository.isDemo,
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
          TextFormField(
            controller: name,
            enabled: !busy,
            maxLength: 255,
            autofillHints: [AutofillHints.name],
            decoration: InputDecoration(labelText: context.l10n.fullName),
            validator: (value) => context.validation(requiredText(value)),
            textInputAction: TextInputAction.next,
          ),
          SizedBox(height: 16),
          TextFormField(
            controller: phone,
            enabled: !busy,
            keyboardType: TextInputType.phone,
            autofillHints: [AutofillHints.telephoneNumber],
            decoration: InputDecoration(labelText: context.l10n.phone),
            validator: (value) => context.validation(phoneError(value)),
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        TextButton(
          onPressed: busy ? null : () => Navigator.maybePop(context),
          child: Text(context.l10n.cancel),
        ),
        SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: context.l10n.save,
            onPressed: save,
            busy: busy,
          ),
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
    title: context.l10n.addVehicle,
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: FutureBuilder<List<CarModel>>(
      future: models,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ListView(
            padding: EdgeInsets.all(20),
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
          return Center(child: CircularProgressIndicator());
        }
        if (snapshot.data!.isEmpty) {
          return EmptyNotice(
            context.l10n.noVehicleModels,
            context.l10n.modelsHint,
          );
        }
        return Form(
          key: form,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          onChanged: () => setState(() => dirty = true),
          child: ListView(
            padding: EdgeInsets.all(Space.page),
            children: [
              Text(
                widget.customer.name,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              SizedBox(height: 24),
              if (error != null) ErrorNotice(error!),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: modelId,
                decoration: InputDecoration(
                  labelText: context.l10n.makeAndModel,
                ),
                menuMaxHeight: 360,
                items: snapshot.data!
                    .map(
                      (m) =>
                          DropdownMenuItem(value: m.id, child: Text(m.label)),
                    )
                    .toList(),
                onChanged: busy ? null : (v) => setState(() => modelId = v),
                validator: (value) => context.validation(requiredText(value)),
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: plate,
                enabled: !busy,
                textCapitalization: TextCapitalization.characters,
                maxLength: 20,
                decoration: InputDecoration(
                  labelText: context.l10n.licensePlate,
                  hintText: '01 A 123 BC',
                ),
                validator: (v) =>
                    RegExp(r'^[A-Za-z0-9]{2,20}$')
                        .hasMatch((v ?? '').replaceAll(RegExp(r'[\s-]'), ''))
                    ? null
                    : context.l10n.plateError,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: year,
                enabled: !busy,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: context.l10n.manufactureYear,
                ),
                validator: (v) {
                  final y = int.tryParse(v ?? '');
                  return y != null && y >= 1900 && y <= DateTime.now().year + 1
                      ? null
                      : context.l10n.yearError;
                },
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: km,
                enabled: !busy,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: context.l10n.odometer,
                  suffixText: 'km',
                ),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  return n != null && n >= 0 && n <= 2147483647
                      ? null
                      : context.l10n.odometerError;
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
            child: Text(context.l10n.cancel),
          ),
          SizedBox(width: 8),
          Expanded(
            child: SaveButton(
              label: context.l10n.save,
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
