// شاشة ٩: إضافة/تعديل عنوان — بيت/شغل + ملاحظات للكابتن
// الحفظ نداء حقيقي (POST/PATCH /customer/addresses) — الـ API بيخزّن الحقول الخام
// (المدينة/الحي/الشارع/المبنى)، فالفورم بيجمّعها زي ما هي بدل سطر تفاصيل واحد.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/address.dart';
import '../../providers/location_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/live_map.dart';

/// المدينة الافتراضية — الـ API بيطلب `city` إجبارياً.
const _kDefaultCity = 'الرياض';

/// الوسائط اللي بتتبعت للشاشة (من الخريطة أو من قائمة العناوين).
class AddressEditorArgs {
  const AddressEditorArgs({
    this.addressId,
    required this.lat,
    required this.lng,
    this.label,
    this.details,
  });

  /// موجود = تعديل عنوان قديم، فاضي = عنوان جديد.
  final String? addressId;
  final double lat;
  final double lng;
  final AddressLabel? label;

  /// التفاصيل الإضافية اللي اتكتبت في شاشة الخريطة — بتتحط في خانة «المبنى».
  final String? details;
}

class AddressEditorScreen extends ConsumerStatefulWidget {
  const AddressEditorScreen({super.key, this.args});

  final AddressEditorArgs? args;

  @override
  ConsumerState<AddressEditorScreen> createState() => _AddressEditorScreenState();
}

class _AddressEditorScreenState extends ConsumerState<AddressEditorScreen> {
  late final TextEditingController _titleController;
  late final TextEditingController _districtController;
  late final TextEditingController _streetController;
  late final TextEditingController _buildingController;
  late final TextEditingController _notesController;

  late AddressLabel _label;
  late bool _isDefault;
  bool _saving = false;

  /// العنوان اللي بنعدّله (لو الشاشة اتفتحت من قائمة العناوين).
  Address? _existing;

  @override
  void initState() {
    super.initState();
    final args = widget.args;
    final id = args?.addressId;

    if (id != null) {
      // القائمة محمّلة أصلاً في شاشة العناوين اللي جاي منها.
      final list = ref.read(addressesProvider).value ?? const <Address>[];
      for (final a in list) {
        if (a.id == id) {
          _existing = a;
          break;
        }
      }
    }

    final existing = _existing;
    _label = args?.label ?? existing?.label ?? AddressLabel.home;
    _isDefault = existing?.isDefault ?? false;

    _titleController = TextEditingController(text: existing?.title ?? '');
    _districtController = TextEditingController(text: existing?.district ?? '');
    _streetController = TextEditingController(text: existing?.street ?? '');
    _buildingController = TextEditingController(text: existing?.building ?? args?.details ?? '');
    _notesController = TextEditingController(text: existing?.notes ?? '');
  }

  @override
  void dispose() {
    _titleController.dispose();
    _districtController.dispose();
    _streetController.dispose();
    _buildingController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  double get _lat => widget.args?.lat ?? _existing?.lat ?? kRiyadhLat;
  double get _lng => widget.args?.lng ?? _existing?.lng ?? kRiyadhLng;

  Future<void> _save() async {
    if (_saving) return;

    final title = _titleController.text.trim();
    final district = _districtController.text.trim();
    final street = _streetController.text.trim();
    final building = _buildingController.text.trim();
    final notes = _notesController.text.trim();
    final existing = _existing;

    final city = existing?.city ?? _kDefaultCity;

    final address = Address(
      // فاضي = عنوان جديد (upsert بتفرّق بيهم).
      id: existing?.id ?? '',
      label: _label,
      // لو فضّى الحقل وهو بيعدّل عنوان قديم، نرجّع قيمته الأصلية — مش النص الافتراضي.
      title: title.isEmpty ? (existing?.title ?? _label.ar) : title,
      details: Address.buildDetails(
        city: city,
        district: district,
        street: street,
        building: building,
      ),
      lat: _lat,
      lng: _lng,
      city: city,
      district: district.isEmpty ? null : district,
      street: street.isEmpty ? null : street,
      building: building.isEmpty ? null : building,
      notes: notes.isEmpty ? null : notes,
      // الـ API بيتولّى تصفير الافتراضي القديم.
      isDefault: _isDefault,
    );

    setState(() => _saving = true);
    try {
      await ref.read(addressesProvider.notifier).upsert(address);
      if (!mounted) return;

      // رجوع لقائمة العناوين بستاك سليم — الخريطة استبدلت نفسها بالمحرّر (pushReplacement).
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(QRoutes.addresses);
      }
    } on ApiException catch (e) {
      // رسالة السيرفر زي ما هي (عنوان ناقص، بره نطاق التوصيل…).
      if (!mounted) return;
      setState(() => _saving = false);
      _showError(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showError(context, 'تعذّر حفظ العنوان — حاول مرة أخرى');
    }
  }

  void _showError(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            message,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: QColors.brand,
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: QColors.inkSurface,
          duration: const Duration(seconds: 3),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.args?.addressId != null;
    final point = LatLng(_lat, _lng);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(title: isEditing ? 'تعديل العنوان' : 'عنوان جديد'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          // معاينة الموقع — غير تفاعلية (التعديل بيتم من شاشة الخريطة).
          ClipRRect(
            borderRadius: BorderRadius.circular(QRadius.lg),
            child: SizedBox(
              height: 160,
              child: IgnorePointer(
                child: LiveMap(center: point, zoom: 15, destination: point),
              ),
            ),
          ),
          const SizedBox(height: QSpace.gapLg),

          Row(
            children: [
              for (final l in AddressLabel.values) ...[
                QChip(
                  label: '${l.emoji} ${l.ar}',
                  selected: _label == l,
                  onTap: () => setState(() => _label = l),
                ),
                if (l != AddressLabel.values.last) const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: QSpace.gapLg),

          QField(
            label: 'اسم العنوان',
            hint: 'المنزل',
            controller: _titleController,
          ),
          const SizedBox(height: QSpace.gapLg),

          QField(
            label: 'الحي',
            hint: 'النرجس',
            controller: _districtController,
          ),
          const SizedBox(height: QSpace.gapLg),

          QField(
            label: 'الشارع',
            hint: 'العليا العام',
            controller: _streetController,
          ),
          const SizedBox(height: QSpace.gapLg),

          QField(
            label: 'المبنى / الفيلا',
            hint: 'فيلا 12، الدور الثاني',
            controller: _buildingController,
          ),
          const SizedBox(height: QSpace.gapLg),

          QField(
            label: 'ملاحظات للكابتن (اختياري)',
            hint: 'الدور الثاني، الباب الأصفر…',
            controller: _notesController,
            maxLines: 2,
          ),
          const SizedBox(height: QSpace.gapLg),

          Row(
            children: [
              Text(
                'تعيين كعنوان افتراضي',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: QColors.ink,
                ),
              ),
              const Spacer(),
              QSwitch(
                value: _isDefault,
                onChanged: (v) => setState(() => _isDefault = v),
              ),
            ],
          ),
        ],
      ),
      bottomNavigationBar: QBottomBar(
        child: QButton(
          label: _saving ? 'جاري الحفظ…' : 'حفظ العنوان',
          enabled: !_saving,
          leading: _saving
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: QColors.ink),
                )
              : null,
          onPressed: _save,
        ),
      ),
    );
  }
}
