<?php
require 'config.php';
$_SESSION = [];
session_destroy();
out(['ok' => true]);
