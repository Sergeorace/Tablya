import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/offline/offline_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  OfflineService.instance.init(); // écoute connectivité + sync file
  runApp(const ProviderScope(child: TablyaApp()));
}
