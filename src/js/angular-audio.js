(function () {
    'use strict';

    angular.module('angularAudio', ['MinuteFramework'])
        .factory("$audio", ['$timeout', '$q', function ($timeout, $q) {
            var audioService = {}, recorder;
            var require = function (src, success, failure) {
                !function (source, success_cb, failure_cb) {
                    var script = document.createElement('script');
                    script.async = true;
                    script.type = 'text/javascript';
                    script.src = source;
                    script.onload = success_cb || function (e) {};
                    script.onerror = failure_cb || function (e) {};
                    (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(script);
                }(src, success, failure);
            };

            audioService.canPlayAudio = function (format) {
                var a = document.createElement('audio');

                return !!(a.canPlayType && a.canPlayType('audio/' + (format || 'mp3') + ';').replace(/no/, ''));
            };

            audioService.getMicHtml5 = function () {
                var deferred = $q.defer();
                var audio_context;

                if (typeof(recorder) !== 'undefined') {
                    //console.log('sent');
                    deferred.resolve(recorder);
                } else {
                    try {
                        window.AudioContext = window.AudioContext || window.webkitAudioContext;
                        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

                        audio_context = new AudioContext;

                        require('/static/bower_components/angular-audio/src/templates/html5/recorder.js', function () {
                            try {
                                navigator.getUserMedia({audio: true}, function (stream) {
                                    var input = audio_context.createMediaStreamSource(stream);

                                    recorder = new Recorder(input, {workerPath: '/static/bower_components/angular-audio/src/templates/html5/recorderWorker.js'});
                                    deferred.resolve(recorder);
                                }, function (e) {
                                    deferred.reject('Unable to access microphone: ' + e.name);
                                });
                            } catch (e) {
                                deferred.reject();
                            }
                        });
                    } catch (e) {
                        deferred.reject();
                    }
                }

                return deferred.promise;
            };

            audioService.getWami = function () {
                var deferred = $q.defer();

                if (typeof(swfobject) === 'undefined') {
                    require('/static/bower_components/angular-audio/src/templates/flash/swfobject.js', function () {audioService.startFlash(deferred)});
                } else if (typeof(Wami) === 'undefined') {
                    audioService.startFlash(deferred);
                } else {
                    deferred.resolve(Wami);
                }

                return deferred.promise;
            };

            audioService.getMp3Player = function (flashId) {
                if (typeof(swfobject) === 'undefined') {
                    require('/static/bower_components/angular-audio/src/templates/flash/swfobject.js', function () {audioService.startMp3Player(flashId)});
                } else {
                    audioService.startMp3Player(flashId);
                }
            };

            audioService.startMp3Player = function (flashId) {
                var swf = '/static/bower_components/angular-audio/src/templates/flash/player_mp3_js.swf';
                swfobject.embedSWF(swf, flashId, 1, 1, "9", "#ffffff", {listener: flashId + 'Listener', interval: 1000}, {menu: false, allowscriptaccess: 'always'}, {id: flashId});
            };

            audioService.startFlash = function (deferred) {
                if (swfobject.hasFlashPlayerVersion("9.0")) {
                    require('/static/bower_components/angular-audio/src/templates/flash/recorder.js',
                        function (util) {
                            try {
                                Wami.setup({
                                    id: "wami",
                                    swfUrl: '/static/bower_components/angular-audio/src/templates/flash/Wami.swf',
                                    onReady: function () {
                                        deferred.resolve(Wami);
                                    },
                                    onError: function () {
                                        deferred.reject('Flash was unable to access your microphone. Please check flash permissions.');
                                    }
                                });
                            } catch (e) {
                                deferred.reject('Unable to start flash audio.');
                            }
                        },
                        function fail() {
                            deferred.reject('Unable to load recorder.js.');
                        });
                } else {
                    deferred.reject('Unable to start either HTML5 or Flash audio on this device.');
                }
            };

            return audioService;
        }])
        .directive('audioRecorder', ['$audio', '$timeout', '$ui', '$http', '$sce', function ($audio, $timeout, $ui, $http, $sce) {
            return {
                restrict: 'A',
                replace: true,
                require: 'ngModel',
                scope: {recBtn: '@', stopBtn: '@'},
                templateUrl: '/static/bower_components/angular-audio/src/templates/audio-recorder.html',
                link: function ($scope, element, attrs, ngModel) {
                    if ($('#wami').length == 0) {
                        element.append('<div id="wami"></div>');
                    }

                    $scope.init = function () {
                        $scope.sound = ngModel.$viewValue;
                        $scope.$watch('sound', function () {
                            ngModel.$setViewValue($scope.sound);
                        });
                    };

                    ngModel.$render = $scope.init;
                },
                controller: function ($scope, $element) {
                    var recorder;

                    $scope.init = function () {
                        $scope.fn = "snd_" + Math.random().toString(36).substring(7);
                        $scope.soundRecorderURL = '/generic/sounder-recorder/' + $scope.fn;

                        $scope.defaultRecBtn = '<i ng-show="!recording" class="fa fa-2x fa-microphone text-danger"></i>';
                        $scope.defaultStopBtn = '<i ng-show="recording" class="fa fa-2x fa-stop-circle text-danger"></i>';

                        $audio.getMicHtml5().then($scope.micHtml5Connect, $scope.micHtml5Fail);
                    };

                    $scope.micHtml5Connect = function (recObj) {
                        recorder = recObj;
                        $scope.html5 = true;
                    };

                    $scope.micHtml5Fail = function (reason) {
                        $ui.toast(reason, 'error');
                        $audio.getWami().then($scope.flashMicConnect, $scope.flashMicFail);
                    };

                    $scope.flashMicConnect = function (wami) {
                        $scope.flash = true;
                    };

                    $scope.flashMicFail = function (reason) {
                        //console.log('flash mic fail too');
                        $ui.toast(reason, 'error');
                        $scope.disabled = true;
                    };

                    $scope.startRecordingHTML5 = function () {
                        if (recorder) {
                            recorder.clear();
                            recorder.record();
                            $scope.sound = null;
                            $scope.recording = true;
                        }
                    };

                    $scope.stopRecordingHTML5 = function () {
                        if (recorder) {
                            recorder.stop();
                            $scope.recording = false;

                            recorder.exportWAV(function (blob) {
                                $http.post($scope.soundRecorderURL, blob).then(function (response) {
                                    if (response && response.data) {
                                        $scope.sound = response.data.url;
                                    }
                                });
                            });
                        }
                    };

                    $scope.startRecordingFlash = function () {
                        Wami.startRecording($scope.soundRecorderURL,
                            Wami.nameCallback(function OnRecordStart(e) {
                                $timeout(function () {
                                    //console.log('flash recording started', e);
                                    $scope.sound = null;
                                    $scope.recording = true;
                                });
                            }),
                            Wami.nameCallback(function OnRecordFinished(data) {
                                $timeout(function () {
                                    $scope.recording = false;
                                    if (data && data[0]) {
                                        $scope.sound = data[0].url;
                                    }
                                });
                            }),
                            Wami.nameCallback(function OnRecordError(e) {
                                $timeout(function () {
                                    $ui.toast('Flash was unable to save your recorded your voice. Please try again later.', 'error');
                                    $scope.recording = false;
                                });
                            })
                        );
                    };

                    $scope.stopRecordingFlash = function () {
                        Wami.stopRecording();
                    };

                    $scope.trusted = function (html) {
                        return $sce.trustAsHtml(html);
                    };

                    $scope.init();
                }
            }
        }])
        .directive('audioPlayer', ['$compile', '$audio', '$timeout', '$ui', '$http', '$sce', function ($compile, $audio, $timeout, $ui, $http, $sce) {
            return {
                restrict: 'A',
                replace: true,
                scope: {sound: '@', skin: '@', playBtn: '@', stopBtn: '@', hideDisabled: '@', autoplay: '@', btnClass: '@', btnText: '@'},
                templateUrl: '/static/bower_components/angular-audio/src/templates/audio-player.html',
                link: function ($scope, element, attrs) {
                    //if ($('#mp3Player').length == 0) {                        element.append('<div id="mp3Player"></div>');                    }
                },
                controller: function ($scope, $element) {
                    var playback, flashId;

                    $scope.defaultBtn = function (type) {
                        return $scope.defaultBtns[$scope.skin || 'round'][type];
                    };

                    $scope.init = function () {
                        $scope.defaultBtns = {
                            icon: {
                                play: '<i class="fa fa-play ' + ($scope.btnClass) + '"></i>',
                                stop: '<i class="fa  fa-stop ' + ($scope.btnClass) + '"></i>'
                            },
                            simple: {
                                play: '<span class="btn ' + ($scope.btnClass || 'btn-success') + '"><i class="fa fa-play"></i> ' + ($scope.btnText || 'Play') + '</span>',
                                stop: '<span class="btn ' + ($scope.btnClass || 'btn-success') + '"><i class="fa fa-stop"></i> ' + ($scope.btnText || 'Stop') + '</span>'
                            },
                            round: {
                                play: '<i class="fa fa-play-circle ' + ($scope.btnClass) + '"></i>',
                                stop: '<i class="fa fa-stop-circle ' + ($scope.btnClass) + '"></i>'
                            }
                        };

                        $scope.html5 = $scope.ready = $audio.canPlayAudio('mp3');

                        if (!$scope.html5) {
                            flashId = "flash_" + Math.random().toString(36).substring(7);
                            $element.append('<div id="' + flashId + '"></div>');

                            window[flashId + 'Listener'] = {
                                onInit: function () {
                                    $timeout(function () {
                                        $scope.ready = true;
                                        $scope.flashObject = document.getElementById(flashId);
                                    });
                                },
                                onUpdate: function () {
                                    var playing = this.isPlaying;
                                    $timeout(function () { $scope.playing = playing == 'true'; });
                                }
                            };

                            $audio.getMp3Player(flashId);
                        }

                        $timeout(function () {
                            if ($scope.autoplay == 'true') {
                                if ($scope.html5) {
                                    $scope.playFileHTML5();
                                } else {
                                    $scope.playFileFlash();
                                }
                            }
                        }, 250);

                        $scope.$watch('sound', $scope.stopAll);
                        $scope.$on('$destroy', $scope.stopAll);
                    };

                    $scope.stopAll = function () {
                        $scope.stopFileHTML5();
                        $scope.stopFileFlash();
                    };

                    $scope.playFileHTML5 = function () {
                        playback = new Audio($scope.sound);
                        playback.addEventListener('ended', $scope.stopFileHTML5);
                        playback.play();

                        $scope.playing = true;
                    };

                    $scope.stopFileHTML5 = function () {
                        if (playback && !playback.paused) {
                            playback.pause();
                        }

                        $timeout(function () {
                            $scope.playing = false;
                        });
                    };

                    $scope.playFileFlash = function () {
                        $scope.flashObject.SetVariable("method:setUrl", $scope.sound);
                        $scope.flashObject.SetVariable("method:play", "");
                        $scope.flashObject.SetVariable("enabled", "true");
                    };

                    $scope.stopFileFlash = function () {
                        if ($scope.flashObject) {
                            $scope.flashObject.SetVariable("method:stop", "");
                        }
                    };

                    $scope.trusted = function (html) {
                        return $sce.trustAsHtml(html);
                    };

                    $scope.init();
                }
            }
        }]);
})();