// شاشة ٧: تحديد الموقع — خريطة + بحث
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/enums.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/location_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/live_map.dart';
import 'address_editor_screen.dart';

class PickLocationScreen extends ConsumerStatefulWidget {
  const PickLocationScreen({super.key});

  @override
  ConsumerState<PickLocationScreen> createState() => _PickLocationScreenState();
}

class _PickLocationScreenState extends ConsumerState<PickLocationScreen> {
  final _detailsController = TextEditingController();

  /// نقطة الدبوس = مركز الخريطة (بتتحدّث مع كل تحريك).
  LatLng _center = const LatLng(kRiyadhLat, kRiyadhLng);
  AddressLabel _label = AddressLabel.home;

  @override
  void dispose() {
    _detailsController.dispose();
    super.dispose();
  }

  void _confirm() {
    final details = _detailsController.text.trim();
    // المحرّر يحلّ محل الخريطة في الستاك — عشان `pop()` بعد الحفظ يرجّع لقائمة العناوين
    // مش للخريطة تاني. الإحداثيات المختارة بتروح معاه زي ما هي.
    context.pushReplacement(
      QRoutes.addressEditor,
      extra: AddressEditorArgs(
        lat: _center.latitude,
        lng: _center.longitude,
        label: _label,
        // مافيش reverse-geocoding — اللي المستخدم كتبه بس (والباقي بيتكتب في المحرّر).
        details: details.isEmpty ? null : details,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.canvas,
      body: Stack(
        fit: StackFit.expand,
        children: [
          LiveMap(
            center: const LatLng(kRiyadhLat, kRiyadhLng),
            zoom: 14,
            onMove: (latLng) => setState(() => _center = latLng),
          ),
          const CenterPin(),
          Positioned(top: 0, left: 0, right: 0, child: _buildTopBar()),
          Positioned(left: 0, right: 0, bottom: 0, child: _buildSheet(context)),
        ],
      ),
    );
  }

  /// رجوع + شريط بحث (شكل فقط — البحث الحقيقي مؤجّل).
  Widget _buildTopBar() {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.all(QSpace.gapLg),
        child: Row(
          children: [
            const QBackButton(light: true),
            const SizedBox(width: QSpace.gap),
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                decoration: BoxDecoration(
                  color: QColors.surface,
                  borderRadius: BorderRadius.circular(13),
                  boxShadow: kCardShadow,
                ),
                child: const Row(
                  children: [
                    Icon(Icons.search, size: 20, color: QColors.hint),
                    SizedBox(width: 8),
                    Text(
                      'ابحث عن حي أو شارع…',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: QColors.hint,
                      ),
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

  Widget _buildSheet(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(
        QSpace.screenH,
        20,
        QSpace.screenH,
        20 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
        boxShadow: kFloatShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: QColors.border,
                borderRadius: BorderRadius.circular(QRadius.pill),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: QColors.tintStrong,
                  borderRadius: BorderRadius.circular(QRadius.md),
                ),
                child: const Text('📍', style: TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: QSpace.gap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'الموقع المحدد على الخريطة',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: QColors.ink,
                      ),
                    ),
                    const SizedBox(height: 3),
                    // مافيش reverse-geocoding — بنعرض الإحداثيات الحقيقية بدل اسم حي وهمي.
                    QLtr(
                      child: Text(
                        '${_center.latitude.toStringAsFixed(5)}, '
                        '${_center.longitude.toStringAsFixed(5)}',
                        style: QText.num(
                          size: 12.5,
                          weight: FontWeight.w600,
                          color: QColors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
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
          const SizedBox(height: 14),
          QField(
            hint: 'تفاصيل إضافية: رقم الفيلا، الدور، علامة مميزة…',
            controller: _detailsController,
          ),
          const SizedBox(height: 14),
          QButton(
            style: QButtonStyle.dark,
            label: 'تأكيد الموقع',
            onPressed: _confirm,
          ),
        ],
      ),
    );
  }
}
